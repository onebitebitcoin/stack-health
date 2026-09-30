"""흑백 카툰 렌더러(`app.services.mono_cartoon`) 단위 + 영상 E2E 테스트."""

from __future__ import annotations

import json
import shutil
import subprocess
from unittest.mock import patch

import numpy as np
import pytest

from app.services.cartoon import VIDEO_FILTERS, filter_video, frame_renderer
from app.services.mono_cartoon import TONES, mono_cartoon_frame

_HAS_FFMPEG = shutil.which("ffmpeg") is not None


def _square_frame(h: int = 240, w: int = 320) -> np.ndarray:
    """밝은 배경 가운데 아주 어두운 사각형."""
    frame = np.full((h, w, 3), 220, np.uint8)
    frame[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4] = 15
    return frame


def _gradient_frame(h: int = 240, w: int = 320) -> np.ndarray:
    """왼쪽 검정 → 오른쪽 흰색으로 밝기가 고르게 변하는 컬러(청록) 프레임."""
    ramp = np.linspace(0, 255, w, dtype=np.float32)[None, :].repeat(h, axis=0)
    return np.stack([ramp, ramp * 0.8, ramp * 0.3], axis=-1).astype(np.uint8)


class TestMonoCartoonFrame:
    def test_shape_and_dtype_and_no_mutation(self):
        frame = _gradient_frame()
        before = frame.copy()
        out = mono_cartoon_frame(frame)
        assert out.shape == frame.shape
        assert out.dtype == np.uint8
        assert np.array_equal(frame, before)

    def test_output_is_colorless(self):
        """컬러 입력이어도 채널 간 차이는 종이의 옅은 웜톤 수준(몇 레벨)에 그친다."""
        out = mono_cartoon_frame(_gradient_frame()).astype(np.int16)
        spread = out.max(axis=2) - out.min(axis=2)
        assert spread.max() <= 6

    def test_flat_tones_not_continuous(self):
        """고른 그라데이션이 몇 가지 평평한 톤으로 계단지게 나뉜다(카툰 셀 셰이딩)."""
        out = mono_cartoon_frame(_gradient_frame(), tone_range=(0.0, 1.0))[..., 1]
        row = out[out.shape[0] // 2]
        levels = np.unique((row // 8) * 8)
        assert len(levels) <= 2 * (len(TONES) + 1)  # 톤 수 + 경계 블러 여유

    def test_dark_region_is_ink_light_region_is_paper(self):
        out = mono_cartoon_frame(_square_frame())[..., 1].astype(np.float32)
        h, w = out.shape
        assert out[h // 2 - 10 : h // 2 + 10, w // 2 - 10 : w // 2 + 10].mean() < 50
        assert out[:20, :20].mean() > 200

    def test_outline_drawn_around_shape(self):
        """밝은 영역 안에서도 사각형 테두리 바로 바깥에는 먹 윤곽선이 그어진다."""
        out = mono_cartoon_frame(_square_frame())[..., 1]
        h, w = out.shape
        ring = out[h // 4 - 4 : h // 4, w // 3 : 2 * w // 3]
        assert ring.min() < 80

    @pytest.mark.parametrize("h,w", [(1920, 1080), (241, 319)])
    def test_arbitrary_sizes(self, h, w):
        assert mono_cartoon_frame(_gradient_frame(h, w)).shape == (h, w, 3)

    def test_deterministic_with_fixed_tone_range(self):
        frame = _square_frame()
        a = mono_cartoon_frame(frame, tone_range=(0.1, 0.9))
        b = mono_cartoon_frame(frame, tone_range=(0.1, 0.9))
        assert np.array_equal(a, b)

    def test_gamma_is_ignored(self):
        frame = _gradient_frame()
        assert np.array_equal(
            mono_cartoon_frame(frame, 0.5, tone_range=(0.1, 0.9)),
            mono_cartoon_frame(frame, 1.0, tone_range=(0.1, 0.9)),
        )


class TestFrameRendererMonoCartoon:
    def test_registered(self):
        assert "mono_cartoon" in VIDEO_FILTERS

    def test_closes_over_tone_range(self):
        """영상 전체 샘플로 구한 lo/hi가 모든 구간의 렌더 호출에 그대로 전달된다."""
        frame = _square_frame()
        render = frame_renderer("mono_cartoon", (0.15, 0.85))
        assert np.array_equal(render(frame, 1.0), mono_cartoon_frame(frame, 1.0, tone_range=(0.15, 0.85)))


@pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg not installed")
class TestFilterVideoMonoCartoon:
    def _make_source(self, tmp_path, duration: int = 1, fps: int = 10):
        src = tmp_path / "in.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-f", "lavfi", "-i", f"testsrc=duration={duration}:size=320x240:rate={fps}",
                "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                str(src),
            ],
            check=True, timeout=60,
        )
        return src

    def test_frames_and_audio_preserved(self, tmp_path):
        src = self._make_source(tmp_path)
        out = tmp_path / "out.mp4"
        filter_video(str(src), str(out), "mono_cartoon")
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,nb_frames",
             "-of", "json", str(out)],
            check=True, capture_output=True, text=True, timeout=30,
        )
        streams = json.loads(probe.stdout)["streams"]
        assert {s["codec_type"] for s in streams} == {"video", "audio"}
        video_stream = next(s for s in streams if s["codec_type"] == "video")
        assert int(video_stream["nb_frames"]) == 10

    def test_tone_range_sampled_once(self, tmp_path):
        """흑백 카툰도 오렌지 카툰처럼 밝기 기준을 영상 전체에서 한 번만 계산한다."""
        src = self._make_source(tmp_path)
        with patch("app.services.cartoon._sample_video_tone_range", return_value=(0.1, 0.9)) as mock_sample:
            filter_video(str(src), str(tmp_path / "out.mp4"), "mono_cartoon")
        mock_sample.assert_called_once()
