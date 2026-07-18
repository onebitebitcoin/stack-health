from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from io import BytesIO

import pytest

requires_ffmpeg = pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="ffmpeg/ffprobe 필요",
)


# ---------------------------------------------------------------------------
# build_srt_from_text — 순수 로직 (ffmpeg 불필요)
# ---------------------------------------------------------------------------

def _srt_cue_count(srt: str) -> int:
    return sum(1 for line in srt.splitlines() if "-->" in line)


def _srt_times(srt: str) -> list[tuple[str, str]]:
    out = []
    for line in srt.splitlines():
        if "-->" in line:
            a, b = line.split("-->")
            out.append((a.strip(), b.strip()))
    return out


def test_build_srt_empty_returns_empty() -> None:
    from tasks.subtitle import build_srt_from_text
    assert build_srt_from_text("", 10.0) == ""
    assert build_srt_from_text("   \n  ", 10.0) == ""


def test_build_srt_short_text_single_cue() -> None:
    from tasks.subtitle import build_srt_from_text
    srt = build_srt_from_text("오늘 운동 끝", 9.0)
    assert _srt_cue_count(srt) == 1
    assert srt.startswith("1\n")
    assert "00:00:00,000 --> 00:00:09,000" in srt
    assert "오늘 운동 끝" in srt


def test_build_srt_splits_long_text_and_distributes() -> None:
    from tasks.subtitle import build_srt_from_text
    text = "오늘은 스쿼트 백개를 했고 정말 힘들었지만 끝까지 버텼다. 내일은 데드리프트를 할 예정이고 더 무겁게 들어볼 것이다."
    total = 12.0
    srt = build_srt_from_text(text, total)
    cues = _srt_cue_count(srt)
    assert cues >= 2
    times = _srt_times(srt)
    # 첫 cue는 0초에서 시작, 마지막 cue는 total에서 끝
    assert times[0][0] == "00:00:00,000"
    assert times[-1][1] == "00:00:12,000"
    # cue가 시간순으로 겹치지 않고 이어짐
    for (s1, e1), (s2, e2) in zip(times, times[1:]):
        assert e1 == s2


def test_build_srt_respects_max_chars() -> None:
    from tasks.subtitle import build_srt_from_text
    long_word = "가" * 100
    srt = build_srt_from_text(long_word, 10.0, max_chars=24)
    for line in srt.splitlines():
        if line and "-->" not in line and not line.isdigit():
            assert len(line) <= 24


def test_build_srt_zero_duration_uses_fallback() -> None:
    from tasks.subtitle import build_srt_from_text
    srt = build_srt_from_text("운동 완료", 0.0)
    assert _srt_cue_count(srt) == 1


# ---------------------------------------------------------------------------
# compose_items — 실제 ffmpeg + R2 mock
# ---------------------------------------------------------------------------

class _FakeR2:
    def __init__(self) -> None:
        self.store: dict[str, bytes] = {}

    def get_object(self, Bucket: str, Key: str) -> dict:
        return {"Body": BytesIO(self.store[Key])}

    def put_object(self, Bucket: str, Key: str, Body, **kwargs) -> dict:
        data = Body.read() if hasattr(Body, "read") else Body
        self.store[Key] = data
        return {}


def _make_image_bytes(w: int = 320, h: int = 480, color: str = "red") -> bytes:
    path = tempfile.mktemp(suffix=".png")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={color}:s={w}x{h}:d=1",
             "-frames:v", "1", path],
            capture_output=True, check=True, timeout=30,
        )
        with open(path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(path):
            os.unlink(path)


def _make_video_bytes(seconds: int = 2, w: int = 320, h: int = 480, with_audio: bool = True) -> bytes:
    path = tempfile.mktemp(suffix=".mp4")
    try:
        cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"testsrc=s={w}x{h}:d={seconds}:r=30"]
        if with_audio:
            cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:d={seconds}"]
        cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
        if with_audio:
            cmd += ["-c:a", "aac", "-shortest"]
        cmd += ["-t", str(seconds), path]
        subprocess.run(cmd, capture_output=True, check=True, timeout=60)
        with open(path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(path):
            os.unlink(path)


def _probe(data: bytes) -> tuple[float, bool]:
    """(duration, has_audio) 반환."""
    path = tempfile.mktemp(suffix=".mp4")
    try:
        with open(path, "wb") as f:
            f.write(data)
        dur = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        aud = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "a:0",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return float(dur), bool(aud)
    finally:
        if os.path.exists(path):
            os.unlink(path)


def _composed_bytes(r2: _FakeR2, key: str) -> bytes:
    return r2.store[key]


@requires_ffmpeg
def test_compose_single_image_is_three_seconds() -> None:
    from tasks.compose import compose_items
    r2 = _FakeR2()
    r2.store["img/a.png"] = _make_image_bytes()
    key, dur = compose_items(r2, [{"kind": "image", "r2_key": "img/a.png"}])
    assert key.startswith("videos/composed-")
    assert 2.5 <= dur <= 3.6
    real_dur, has_audio = _probe(_composed_bytes(r2, key))
    assert 2.5 <= real_dur <= 3.6
    assert has_audio  # 무음 트랙 포함


@requires_ffmpeg
def test_compose_three_images() -> None:
    from tasks.compose import compose_items
    r2 = _FakeR2()
    items = []
    for i, c in enumerate(["red", "green", "blue"]):
        k = f"img/{i}.png"
        r2.store[k] = _make_image_bytes(color=c)
        items.append({"kind": "image", "r2_key": k})
    _, dur = compose_items(r2, items)
    assert 8.0 <= dur <= 10.0  # 3장 × 3초 ≈ 9초


@requires_ffmpeg
def test_compose_image_then_video() -> None:
    from tasks.compose import compose_items
    r2 = _FakeR2()
    r2.store["img/a.png"] = _make_image_bytes()
    r2.store["vid/a.mp4"] = _make_video_bytes(seconds=2)
    key, dur = compose_items(r2, [
        {"kind": "image", "r2_key": "img/a.png"},
        {"kind": "video", "r2_key": "vid/a.mp4"},
    ])
    assert 4.5 <= dur <= 5.6  # 3초 이미지 + 2초 영상
    _, has_audio = _probe(_composed_bytes(r2, key))
    assert has_audio


@requires_ffmpeg
def test_compose_video_then_image() -> None:
    from tasks.compose import compose_items
    r2 = _FakeR2()
    r2.store["vid/a.mp4"] = _make_video_bytes(seconds=2)
    r2.store["img/a.png"] = _make_image_bytes()
    _, dur = compose_items(r2, [
        {"kind": "video", "r2_key": "vid/a.mp4"},
        {"kind": "image", "r2_key": "img/a.png"},
    ])
    assert 4.5 <= dur <= 5.6


@requires_ffmpeg
def test_compose_video_without_audio_gets_silent_track() -> None:
    from tasks.compose import compose_items
    r2 = _FakeR2()
    r2.store["vid/a.mp4"] = _make_video_bytes(seconds=2, with_audio=False)
    r2.store["img/a.png"] = _make_image_bytes()
    key, dur = compose_items(r2, [
        {"kind": "video", "r2_key": "vid/a.mp4"},
        {"kind": "image", "r2_key": "img/a.png"},
    ])
    assert 4.5 <= dur <= 5.6
    _, has_audio = _probe(_composed_bytes(r2, key))
    assert has_audio  # 무음 트랙이 추가되어 concat 가능


@requires_ffmpeg
def test_compose_mute_video() -> None:
    from tasks.compose import compose_items
    r2 = _FakeR2()
    r2.store["vid/a.mp4"] = _make_video_bytes(seconds=2, with_audio=True)
    key, dur = compose_items(r2, [{"kind": "video", "r2_key": "vid/a.mp4"}], mute_video=True)
    assert 1.5 <= dur <= 2.6
    _, has_audio = _probe(_composed_bytes(r2, key))
    assert has_audio  # 무음으로 대체되지만 트랙은 존재


def test_compose_empty_raises() -> None:
    from tasks.compose import compose_items
    with pytest.raises(ValueError):
        compose_items(_FakeR2(), [])


# ---------------------------------------------------------------------------
# EXIF orientation — 폰 세로 사진 (센서 가로 + Orientation=6)
# ---------------------------------------------------------------------------

def _make_exif_portrait_jpeg(sensor_w: int = 480, sensor_h: int = 320) -> bytes:
    """센서 원본은 가로(480x320), EXIF Orientation=6(90° CW 회전 필요) JPEG.

    올바른 표시 결과는 세로 320x480이다 — 폰 세로 사진의 저장 방식.
    """
    from PIL import Image

    img = Image.new("RGB", (sensor_w, sensor_h), (200, 50, 50))
    exif = Image.Exif()
    exif[0x0112] = 6
    buf = BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_normalize_image_orientation_bakes_rotation(tmp_path) -> None:
    from PIL import Image

    from tasks.compose import _normalize_image_orientation

    p = tmp_path / "portrait.jpg"
    p.write_bytes(_make_exif_portrait_jpeg())
    _normalize_image_orientation(str(p))
    with Image.open(p) as im:
        assert im.size == (320, 480)  # 픽셀이 세로로 회전됨
        assert im.getexif().get(0x0112, 1) == 1  # 태그 제거/초기화


def test_normalize_image_orientation_skips_untagged(tmp_path) -> None:
    """태그 없는 이미지는 재인코딩하지 않는다 (바이트 동일)."""
    from PIL import Image

    p = tmp_path / "plain.jpg"
    img = Image.new("RGB", (320, 480), (50, 200, 50))
    img.save(p, format="JPEG")
    before = p.read_bytes()

    from tasks.compose import _normalize_image_orientation

    _normalize_image_orientation(str(p))
    assert p.read_bytes() == before


def test_normalize_image_orientation_bad_file_keeps_original(tmp_path) -> None:
    p = tmp_path / "broken.jpg"
    p.write_bytes(b"not an image")

    from tasks.compose import _normalize_image_orientation

    _normalize_image_orientation(str(p))  # 예외 없이 통과
    assert p.read_bytes() == b"not an image"


@requires_ffmpeg
def test_compose_exif_portrait_image_stays_portrait() -> None:
    """EXIF 세로 사진 단독 업로드: 합성 결과 캔버스가 세로여야 한다."""
    from tasks.compose import compose_items

    r2 = _FakeR2()
    r2.store["img/p.jpg"] = _make_exif_portrait_jpeg()
    key, _ = compose_items(r2, [{"kind": "image", "r2_key": "img/p.jpg"}])

    path = tempfile.mktemp(suffix=".mp4")
    try:
        with open(path, "wb") as f:
            f.write(_composed_bytes(r2, key))
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        w, h = (int(x) for x in out.split(","))
        assert h > w, f"세로 사진인데 캔버스가 가로: {w}x{h}"
    finally:
        if os.path.exists(path):
            os.unlink(path)
