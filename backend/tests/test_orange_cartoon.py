"""오렌지 카툰 렌더러(`app.services.orange_cartoon`) 단위 + 영상 E2E 테스트."""

from __future__ import annotations

import json
import shutil
import subprocess

import numpy as np
import pytest

from app.services.cartoon import _sample_video_tone_range, filter_video, frame_renderer
from app.services.orange_cartoon import (
    INK_BGR,
    ORANGE_BGR,
    PAPER_BGR,
    orange_cartoon_frame,
    sample_tone_range,
)

_HAS_FFMPEG = shutil.which("ffmpeg") is not None

_PALETTE_255 = np.stack([PAPER_BGR, ORANGE_BGR, INK_BGR]) * 255.0
_PALETTE_LO = _PALETTE_255.min(axis=0)
_PALETTE_HI = _PALETTE_255.max(axis=0)
# 종이 결(_paper_texture)·잉크 결(_ink_wear)이 판 색을 최대 ±5% 곱해 흔든다(0.85~1.05배).
# 팔레트 범위 밖으로 살짝 넘칠 수 있어 여유를 둔다 — 그래도 "채도 높은 파랑" 같은 이질적인
# 색이 새어나오면 이 여유를 훨씬 넘는다.
_PALETTE_MARGIN = 25.0


def _square_frame(h: int = 240, w: int = 320) -> np.ndarray:
    """밝은 배경 가운데 어두운 사각형 — 오렌지판·먹판 경계가 사각형 테두리에만 생겨야 한다."""
    frame = np.full((h, w, 3), 200, np.uint8)
    frame[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4] = 50
    return frame


class TestOrangeCartoonFrame:
    def test_shape_and_dtype_and_no_mutation(self):
        frame = _square_frame()
        original = frame.copy()
        out = orange_cartoon_frame(frame, tone_range=(0.0, 1.0))
        assert out.shape == frame.shape
        assert out.dtype == np.uint8
        assert np.array_equal(frame, original)

    def test_colors_within_palette(self):
        """입력 색과 무관하게 종이·오렌지·먹 세 색과 그 사이 값만 나온다 — 채도 높은
        파랑이 섞인 입력을 넣어도 그 색이 출력에 새어나오지 않는다."""
        frame = _square_frame()
        frame[:, : frame.shape[1] // 2] = [255, 0, 0]  # 왼쪽 절반을 채도 높은 파랑으로
        out = orange_cartoon_frame(frame, tone_range=(0.0, 1.0)).astype(np.float32)
        assert (out >= _PALETTE_LO - _PALETTE_MARGIN).all()
        assert (out <= _PALETTE_HI + _PALETTE_MARGIN).all()

    def test_dark_region_is_ink_plate(self):
        """어두운 사각형 중심은 먹판(g < 0.22) 색으로 거의 정확히 찍힌다."""
        h, w = 240, 320
        out = orange_cartoon_frame(_square_frame(h, w), tone_range=(0.0, 1.0)).astype(np.float32)
        center = out[h // 2 - 10 : h // 2 + 10, w // 2 - 10 : w // 2 + 10]
        assert np.allclose(center.mean(axis=(0, 1)), INK_BGR * 255, atol=3)

    def test_no_hatching_uniform_orange_band(self):
        """빗금(해칭)을 넣지 않았으므로, 밝기가 균일해 오렌지판 대역(0.22<=g<0.64)에 드는
        입력은 오렌지 한 가지 색으로 거의 균일하게 나온다."""
        frame = np.full((240, 320, 3), 120, np.uint8)  # tone_range=(0,1)에서 g≈0.51
        out = orange_cartoon_frame(frame, tone_range=(0.0, 1.0)).astype(np.float32)
        crop = out[20:-20, 20:-20]  # 먹판 시프트가 만드는 테두리 아티팩트 제외
        assert crop.reshape(-1, 3).std(axis=0).max() < 5.0
        assert np.allclose(crop.reshape(-1, 3).mean(axis=0), ORANGE_BGR * 255, atol=5)

    def test_no_hatching_uniform_ink_band(self):
        """밝기가 균일해 먹판 대역(g < 0.22)에 드는 입력도 먹 한 가지 색으로 거의 균일하다."""
        frame = np.full((240, 320, 3), 140, np.uint8)
        out = orange_cartoon_frame(frame, tone_range=None).astype(np.float32)
        crop = out[20:-20, 20:-20]
        assert crop.reshape(-1, 3).std(axis=0).max() < 5.0
        assert np.allclose(crop.reshape(-1, 3).mean(axis=0), INK_BGR * 255, atol=3)

    def test_deterministic_with_fixed_tone_range(self):
        """밝기 기준(tone_range)을 고정해 넘기면 같은 입력 프레임이 몇 번을 렌더해도
        같은 출력을 낸다 — 구간 병렬 프로세스 사이에서도 결과가 갈리면 안 된다."""
        frame = _square_frame()
        out1 = orange_cartoon_frame(frame, tone_range=(0.1, 0.9))
        out2 = orange_cartoon_frame(frame, tone_range=(0.1, 0.9))
        assert np.array_equal(out1, out2)

    def test_gamma_is_ignored(self):
        """감마가 아니라 tone_range가 밝기 보정을 전담하므로, 감마 값을 바꿔도 tone_range가
        같으면 출력이 같다."""
        frame = _square_frame()
        out_a = orange_cartoon_frame(frame, gamma=1.0, tone_range=(0.1, 0.9))
        out_b = orange_cartoon_frame(frame, gamma=0.4, tone_range=(0.1, 0.9))
        assert np.array_equal(out_a, out_b)


class TestSampleToneRange:
    def test_pools_all_frames(self):
        """여러 프레임을 모아 한 번에 백분위를 잰다 — 순서를 바꿔도 같은 값이 나온다
        (프레임을 뽑는 순서가 달라져도 모든 구간이 같은 기준을 받는다)."""
        frames = [
            np.random.default_rng(i).integers(0, 256, (200, 300, 3), dtype=np.uint8) for i in range(6)
        ]
        lo1, hi1 = sample_tone_range(frames)
        lo2, hi2 = sample_tone_range(list(reversed(frames)))
        assert (lo1, hi1) == (lo2, hi2)
        assert lo1 < hi1

    def test_single_frame(self):
        frame = np.random.default_rng(3).integers(0, 256, (240, 320, 3), dtype=np.uint8)
        lo, hi = sample_tone_range([frame])
        assert 0.0 <= lo < hi <= 1.0


class TestFrameRendererOrangeCartoon:
    def test_closes_over_tone_range(self):
        """`frame_renderer`가 반환한 콜러블은 `orange_cartoon_frame`을 같은 tone_range로
        호출한 것과 동일한 결과를 낸다 — 영상 전체 샘플로 구한 lo/hi가 모든 구간의
        렌더 호출에 동일하게 전달된다는 계약을 보장한다."""
        frame = _square_frame()
        render = frame_renderer("orange_cartoon", (0.15, 0.85))
        assert np.array_equal(render(frame, 1.0), orange_cartoon_frame(frame, 1.0, tone_range=(0.15, 0.85)))

    def test_known_filter(self):
        render = frame_renderer("orange_cartoon")
        out = render(_square_frame())
        assert out.dtype == np.uint8


@pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg not installed")
class TestFilterVideoOrangeCartoon:
    def _make_source(self, tmp_path, duration: int = 1, size: str = "320x240", fps: int = 10):
        src = tmp_path / "in.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-f", "lavfi", "-i", f"testsrc=duration={duration}:size={size}:rate={fps}",
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
        filter_video(str(src), str(out), "orange_cartoon")
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,nb_frames",
             "-of", "json", str(out)],
            check=True, capture_output=True, text=True, timeout=30,
        )
        streams = json.loads(probe.stdout)["streams"]
        assert {s["codec_type"] for s in streams} == {"video", "audio"}
        video_stream = next(s for s in streams if s["codec_type"] == "video")
        assert int(video_stream["nb_frames"]) == 10

    def test_sample_video_tone_range_returns_ordered_bounds(self, tmp_path):
        src = self._make_source(tmp_path, duration=2, fps=15)
        lo, hi = _sample_video_tone_range(str(src), frame_count=30)
        assert 0.0 <= lo < hi <= 1.0

    def test_unknown_filter_rejected_before_decoding(self, tmp_path):
        with pytest.raises(ValueError, match="unknown video filter"):
            filter_video(str(tmp_path / "missing.mp4"), str(tmp_path / "out.mp4"), "sepia")

    def test_tone_range_sampled_once_for_multi_segment_video(self, tmp_path):
        """긴 영상(구간 병렬 경로)에서도 밝기 기준(lo/hi)은 영상 전체 샘플로 딱 한 번만
        계산되고, 그 값이 모든 구간의 렌더 호출에 그대로 전달된다 — 구간마다 새로
        추정하면 톤이 구간 경계에서 끊긴다."""
        from unittest.mock import patch

        src = self._make_source(tmp_path, duration=8, size="320x240", fps=24)  # 192 frames
        out = tmp_path / "out.mp4"
        with patch(
            "app.services.cartoon._sample_video_tone_range", return_value=(0.1, 0.9),
        ) as mock_sample:
            filter_video(str(src), str(out), "orange_cartoon")
        mock_sample.assert_called_once()
        assert out.exists()
