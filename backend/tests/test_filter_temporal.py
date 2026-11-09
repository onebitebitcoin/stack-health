"""노출 변화와 병렬 구간 경계의 깜빡임 회귀 테스트."""

import shutil
import subprocess

import cv2
import numpy as np
import pytest

from app.services import cartoon


def _ramp(offset):
    # 그라데이션이라 CLAHE 히스토그램이 한 칸에 몰리지 않는다(단색 프레임은 실제 영상에 없다).
    x = np.linspace(0, 60, 64)[None, :].repeat(48, 0)
    gray = np.clip(x + offset, 0, 255).astype(np.uint8)
    return cv2.merge([gray, gray, gray])


@pytest.mark.parametrize("name", ["orange_cartoon", "mono_cartoon"])
def test_one_luma_step_does_not_flip_a_whole_plate(name):
    # 노출이 1레벨씩 서서히 바뀔 때 판 하나가 통째로 켜지거나 꺼지면 안 된다
    # (이진 판정일 때 최대 7~8, 연속 경계로 바꾼 뒤 4~5).
    render = cartoon.frame_renderer(name, (0.0, 1.0))
    previous = render(_ramp(0)).astype(np.float32)
    for offset in range(1, 190):
        current = render(_ramp(offset)).astype(np.float32)
        assert np.abs(current - previous).mean() < 6
        previous = current


def test_gamma_near_one_has_no_bypass_jump():
    frame = np.full((48, 64, 3), 100, np.uint8)
    a = cartoon._enhance(frame, 0.9899)
    b = cartoon._enhance(frame, 0.9901)
    assert np.abs(a.astype(float) - b).max() <= 1


@pytest.fixture
def exposure_video(tmp_path):
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed")
    # 두 번째 구간의 예열 시작(41)은 5프레임 샘플 주기와 어긋난다.
    frames = [np.full((48, 64, 3), 20 if i < 30 else 100 + i % 9, np.uint8) for i in range(202)]
    path = tmp_path / "exposure.mkv"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", "64x48", "-r", "30", "-i", "-", "-c:v", "ffv1", str(path)],
        input=b"".join(f.tobytes() for f in frames), check=True, timeout=30,
    )
    return path, frames


def test_segment_gamma_matches_sequential_history(exposure_video):
    path, frames = exposure_video
    expected = []
    gamma = None
    for idx, frame in enumerate(frames):
        gamma = cartoon._sample_gamma(frame, gamma, idx)
        expected.append(gamma)
    segments = cartoon._plan_segments(len(frames), 2)
    states = cartoon._segment_gamma_states(str(path), [p for _, _, p in segments], 64, 48)
    for start, end, pad in segments:
        gamma = states[pad]
        for idx in range(pad, end):
            gamma = cartoon._sample_gamma(frames[idx], gamma, idx)
            if idx >= start:
                assert gamma == expected[idx]


def test_segment_pipeline_preserves_frames_and_pool_independence(exposure_video, tmp_path, monkeypatch):
    path, _ = exposure_video
    single = tmp_path / "single.mp4"
    split = tmp_path / "split.mp4"
    monkeypatch.setattr(cartoon, "_worker_pool_size", lambda: 1)
    cartoon.filter_video(str(path), str(single), "monet")
    monkeypatch.setattr(cartoon, "_worker_pool_size", lambda: 2)

    def no_fallback(*args, **kwargs):
        pytest.fail("구간 렌더 실패를 프레임 경로로 숨기면 안 된다")

    monkeypatch.setattr(cartoon, "_cartoonize_frame_parallel", no_fallback)
    cartoon.filter_video(str(path), str(split), "monet")
    captures = [cv2.VideoCapture(str(p)) for p in (single, split)]
    try:
        assert [int(c.get(cv2.CAP_PROP_FRAME_COUNT)) for c in captures] == [202, 202]
        for idx in range(202):
            pairs = [c.read() for c in captures]
            assert all(ok for ok, _ in pairs)
            # 서로 다른 GOP의 손실 압축 오차만 허용한다. 이 64x48 영상은 경계에서 먼
            # 프레임도 압축 오차가 4.7까지 난다. 감마 일치 자체는 위 테스트가 정확히 검증한다.
            if 98 <= idx <= 104:
                a, b = (f.astype(float) for _, f in pairs)
                assert np.abs(a - b).mean() < 5
    finally:
        for cap in captures:
            cap.release()


def _flat(value, noise_seed=None):
    frame = np.full((60, 80, 3), value, np.float32)
    if noise_seed is not None:
        frame += np.random.default_rng(noise_seed).normal(0, 3.0, frame.shape)
    return np.clip(frame, 0, 255).astype(np.uint8)


def test_temporal_denoiser_passes_first_frame_through():
    frame = _flat(90, noise_seed=1)
    assert np.array_equal(cartoon.TemporalDenoiser()(frame), frame)


def test_temporal_denoiser_reduces_static_sensor_noise():
    denoise = cartoon.TemporalDenoiser()
    raw = [_flat(90, noise_seed=i) for i in range(20)]
    out = [denoise(f).astype(np.float32) for f in raw]
    raw_jitter = np.abs(np.diff(np.asarray(raw, np.float32)[5:], axis=0)).mean()
    out_jitter = np.abs(np.diff(np.asarray(out)[5:], axis=0)).mean()
    assert out_jitter < raw_jitter * 0.6


def test_temporal_denoiser_leaves_no_trail_behind_moving_object():
    # 대비가 큰 물체가 빠르게 지나간 자리는 바로 배경으로 돌아와야 한다(잔상 없음)
    denoise = cartoon.TemporalDenoiser()
    for t in range(6):
        frame = _flat(100)
        frame[20:40, 10 * t:10 * t + 20] = 160
        out = denoise(frame).astype(np.float32)
    left_behind = out[20:40, 0:10 * 5]
    assert np.abs(left_behind - 100).max() <= 1
