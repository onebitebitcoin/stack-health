"""연필 스케치 렌더러(`app.services.sketch`) 단위 + 영상 E2E 테스트."""

from __future__ import annotations

import json
import shutil
import subprocess

import cv2
import numpy as np
import pytest

from app.services.cartoon import filter_video, frame_renderer
from app.services.sketch import PAPER_BGR, PENCIL_BGR, sketch_frame

_HAS_FFMPEG = shutil.which("ffmpeg") is not None


def _square_frame(h: int = 240, w: int = 320) -> np.ndarray:
    """밝은 배경 가운데 어두운 사각형 — 윤곽선이 사각형 테두리에만 생겨야 한다."""
    frame = np.full((h, w, 3), 200, np.uint8)
    frame[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4] = 50
    return frame


def _ink_ratio(out: np.ndarray) -> np.ndarray:
    """픽셀별 잉크 비율(0=종이, 1=흑연). 종이 결 때문에 종이도 0 근처에서 조금 흔들린다."""
    paper = PAPER_BGR.mean() * 255
    ink = float(np.mean(PENCIL_BGR)) * 255
    return np.clip((paper - out.mean(axis=2)) / (paper - ink), 0, 1)


class TestSketchFrame:
    def test_shape_and_no_mutation(self):
        frame = _square_frame()
        original = frame.copy()
        out = sketch_frame(frame)
        assert out.shape == frame.shape
        assert out.dtype == np.uint8
        assert np.array_equal(frame, original)

    def test_monochrome(self):
        """입력 색과 무관하게 종이·흑연 두 색 사이의 값만 나온다."""
        frame = _square_frame()
        frame[..., 2] = 255  # 빨강 계열로 물들여도
        out = sketch_frame(frame).astype(np.int16)
        spread = out.max(axis=2) - out.min(axis=2)
        assert spread.max() <= 12  # 종이(234,240,244)와 연필(52,48,46) 사이 — 채도 없음

    def test_lines_on_edges_shading_inside(self):
        """사각형 테두리는 진한 선, 어두운 안쪽은 그보다 옅은 연필 음영, 밝은 바깥은 종이로 남는다."""
        h, w = 240, 320
        ink = _ink_ratio(sketch_frame(_square_frame(h, w)))
        edge_band = ink[h // 4 - 3 : h // 4 + 4, w // 4 + 10 : 3 * w // 4 - 10]
        assert edge_band.max(axis=0).mean() > 0.8  # 윗변을 따라 끊기지 않은 선
        inside = ink[h // 2 - 10 : h // 2 + 10, w // 2 - 10 : w // 2 + 10]
        assert 0.05 < inside.mean() < 0.5  # 어두운 면은 칠하되 선보다 옅게
        assert ink[5:30, 5:30].max() < 0.15

    def test_small_input_change_does_not_flip_lines(self):
        """밝기가 조금 바뀌어도 선이 통째로 켜지거나 꺼지지 않는다 — 깜빡임 회귀 방지.

        예전 크로키는 대비가 문턱값 근처인 무늬에서 0/1 판정이 뒤집혀, 노이즈 수준의 변화에도 선 조각이
        사라지거나 생겼다(이 장면에서 농도가 0.5 넘게 뒤집힌 픽셀 0.57%). 연필 스케치는 0.04% 이하다.
        """
        rng = np.random.default_rng(1)
        scene = np.full((270, 480), 150, np.float32)
        for y, x in zip(rng.integers(0, 262, 300), rng.integers(0, 470, 300)):
            scene[y : y + 6, x : x + 9] -= 8 + x / 480 * 40  # 왼쪽은 옅게, 오른쪽은 진하게
        scene = cv2.GaussianBlur(scene, (0, 0), 1.2)
        noise = np.random.default_rng(9).normal(0, 1.5, scene.shape)
        base = cv2.merge([np.clip(scene, 0, 255).astype(np.uint8)] * 3)
        nudged = cv2.merge([np.clip(scene + noise, 0, 255).astype(np.uint8)] * 3)
        flipped = np.abs(_ink_ratio(sketch_frame(base)) - _ink_ratio(sketch_frame(nudged))) > 0.5
        assert flipped.mean() < 0.002

    def test_isolated_texture_removed(self):
        """평평한 면 위 잔질감(작은 노이즈 점)은 진한 선으로 남지 않는다 — 카툰 필터의 땡땡이 회귀 방지."""
        rng = np.random.default_rng(11)
        frame = np.full((240, 320, 3), 150, np.int16)
        frame += rng.integers(-6, 7, (240, 320, 1), dtype=np.int16)
        out = sketch_frame(np.clip(frame, 0, 255).astype(np.uint8))
        assert (_ink_ratio(out) > 0.5).mean() < 0.002

    def test_same_look_across_resolutions(self):
        """픽셀 파라미터가 해상도에 비례하므로 540p·1080p의 선 밀도가 비슷하다."""
        small = _square_frame(540, 720)
        large = cv2.resize(small, (1440, 1080), interpolation=cv2.INTER_NEAREST)
        density_small = (_ink_ratio(sketch_frame(small)) > 0.5).mean()
        density_large = (_ink_ratio(sketch_frame(large)) > 0.5).mean()
        assert density_small > 0
        assert density_large == pytest.approx(density_small, rel=0.35)

    def test_paper_texture_is_deterministic(self):
        """같은 프레임은 몇 번을 렌더해도 같다 — 구간 병렬 프로세스 사이에서도 종이 결이 일치해야 한다."""
        frame = _square_frame()
        assert np.array_equal(sketch_frame(frame), sketch_frame(frame))


class TestFrameRenderer:
    def test_known_filters(self):
        assert frame_renderer("sketch") is sketch_frame
        assert frame_renderer("cartoon").__name__ == "cartoon_frame"

    def test_unknown_filter_raises(self):
        with pytest.raises(ValueError):
            frame_renderer("sepia")


@pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg not installed")
class TestFilterVideoSketch:
    def test_frames_and_audio_preserved(self, tmp_path):
        src = tmp_path / "in.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-f", "lavfi", "-i", "testsrc=duration=1:size=320x240:rate=10",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                str(src),
            ],
            check=True, timeout=60,
        )
        out = tmp_path / "out.mp4"
        filter_video(str(src), str(out), "sketch")
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,nb_frames",
             "-of", "json", str(out)],
            check=True, capture_output=True, text=True, timeout=30,
        )
        streams = json.loads(probe.stdout)["streams"]
        assert {s["codec_type"] for s in streams} == {"video", "audio"}
        video_stream = next(s for s in streams if s["codec_type"] == "video")
        assert int(video_stream["nb_frames"]) == 10

    def test_unknown_filter_rejected_before_decoding(self, tmp_path):
        with pytest.raises(ValueError, match="unknown video filter"):
            filter_video(str(tmp_path / "missing.mp4"), str(tmp_path / "out.mp4"), "sepia")
