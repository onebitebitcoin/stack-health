"""모네 인상주의 렌더러(`app.services.monet`) 단위 + 영상 E2E 테스트."""

from __future__ import annotations

import json
import shutil
import subprocess

import numpy as np
import pytest

from app.services.cartoon import VIDEO_FILTERS, filter_video, frame_renderer
from app.services.monet import monet_frame

_HAS_FFMPEG = shutil.which("ffmpeg") is not None


def _scene(h: int = 360, w: int = 240, seed: int = 0) -> np.ndarray:
    """위는 어두운 나무 그늘, 아래는 밝은 잔디, 가운데 흰 물체가 있는 자연 배경 비슷한 장면."""
    rng = np.random.default_rng(seed)
    frame = np.empty((h, w, 3), np.uint8)
    frame[: h // 3] = (20, 45, 25)
    frame[h // 3 :] = (40, 190, 110)
    frame[h // 2 : h // 2 + 30, w // 3 : w // 3 + 50] = 235
    noise = rng.integers(-6, 7, frame.shape)
    return np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)


class TestMonetFrame:
    def test_shape_dtype_and_no_mutation(self):
        frame = _scene()
        before = frame.copy()
        out = monet_frame(frame)
        assert out.shape == frame.shape
        assert out.dtype == np.uint8
        assert np.array_equal(frame, before)

    @pytest.mark.parametrize("h,w", [(1920, 1080), (241, 319), (8, 6)])
    def test_arbitrary_sizes(self, h, w):
        """작업 해상도보다 크든 작든, 홀수 크기든 같은 크기로 돌려준다."""
        out = monet_frame(_scene(h, w))
        assert out.shape == (h, w, 3)

    def test_deterministic(self):
        """붓자국·캔버스 결이 고정 시드라 같은 입력은 항상 같은 출력이 된다(영상 깜빡임 방지)."""
        frame = _scene()
        assert np.array_equal(monet_frame(frame), monet_frame(frame))

    def test_small_input_change_gives_small_output_change(self):
        """카메라 잡음 수준으로 달라진 두 프레임의 출력 차이가 입력 차이보다 크지 않아야 한다.
        붓자국을 프레임마다 새로 만들면 이 차이가 크게 튄다."""
        a, b = _scene(seed=1), _scene(seed=2)
        in_diff = np.abs(a.astype(np.int16) - b).mean()
        out_diff = np.abs(monet_frame(a).astype(np.int16) - monet_frame(b)).mean()
        assert out_diff <= in_diff

    def test_shadows_turn_blue_violet_not_black(self):
        """완전히 검은 프레임도 검정으로 남지 않고 파랑이 빨강·초록보다 큰 청보라가 된다."""
        out = monet_frame(np.zeros((120, 80, 3), np.uint8)).reshape(-1, 3).mean(axis=0)
        b, g, r = out
        assert b > 25
        assert b > r > g

    def test_lower_gamma_brightens(self):
        frame = (_scene() * 0.3).astype(np.uint8)
        dark = monet_frame(frame, gamma=1.0).mean()
        lifted = monet_frame(frame, gamma=0.5).mean()
        assert lifted > dark


class TestFrameRendererMonet:
    def test_registered(self):
        assert "monet" in VIDEO_FILTERS
        assert frame_renderer("monet") is monet_frame


@pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg not installed")
class TestFilterVideoMonet:
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
        filter_video(str(src), str(out), "monet")
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,nb_frames",
             "-of", "json", str(out)],
            check=True, capture_output=True, text=True, timeout=30,
        )
        streams = json.loads(probe.stdout)["streams"]
        assert {s["codec_type"] for s in streams} == {"video", "audio"}
        video_stream = next(s for s in streams if s["codec_type"] == "video")
        assert int(video_stream["nb_frames"]) == 10
