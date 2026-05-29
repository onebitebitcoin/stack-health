from __future__ import annotations

import subprocess
from io import BytesIO
from unittest.mock import MagicMock, patch


def _mock_r2(video_bytes: bytes = b"fake-video") -> MagicMock:
    r2 = MagicMock()
    r2.get_object.return_value = {"Body": BytesIO(video_bytes)}
    r2.put_object.return_value = {}
    r2.delete_object.return_value = {}
    return r2


def _ffprobe_result(has_audio: bool) -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(
        args=[], returncode=0,
        stdout="audio\n" if has_audio else "",
        stderr="",
    )


def _ffmpeg_result(success: bool = True) -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(
        args=[], returncode=0 if success else 1,
        stdout="",
        stderr="" if success else "ffmpeg error",
    )


def _meta_result() -> subprocess.CompletedProcess:
    """_compress_video 마지막 단계의 meta ffprobe 호출(JSON) 모킹."""
    return subprocess.CompletedProcess(args=[], returncode=0, stdout="{}", stderr="")


@patch("tasks.full_pipeline.subprocess.run")
def test_compress_video_with_audio(mock_run) -> None:
    from tasks.full_pipeline import _compress_video

    mock_run.side_effect = [_ffprobe_result(has_audio=True), _ffmpeg_result(), _meta_result()]
    r2 = _mock_r2()

    result = _compress_video(r2, "videos/original.mp4")

    assert result is not None
    # _compress_video는 (compressed_key, pre_bytes, post_bytes, video_meta) 튜플을 반환한다.
    compressed_key, _pre, _post, _meta = result
    assert compressed_key.startswith("videos/c-")
    assert compressed_key.endswith(".mp4")
    r2.get_object.assert_called_once()
    r2.put_object.assert_called_once()
    ffmpeg_cmd = mock_run.call_args_list[1][0][0]
    assert "-c:a" in ffmpeg_cmd
    assert "aac" in ffmpeg_cmd
    # 전달 용량 절감을 위해 ultrafast가 아닌 veryfast preset 사용
    assert "veryfast" in ffmpeg_cmd
    assert "ultrafast" not in ffmpeg_cmd


@patch("tasks.full_pipeline.subprocess.run")
def test_compress_video_no_audio(mock_run) -> None:
    from tasks.full_pipeline import _compress_video

    mock_run.side_effect = [_ffprobe_result(has_audio=False), _ffmpeg_result(), _meta_result()]
    r2 = _mock_r2()

    result = _compress_video(r2, "videos/silent.mp4")

    assert result is not None
    ffmpeg_cmd = mock_run.call_args_list[1][0][0]
    assert "-an" in ffmpeg_cmd
    assert "veryfast" in ffmpeg_cmd


@patch("tasks.full_pipeline.subprocess.run")
def test_compress_video_ffmpeg_failure_returns_none(mock_run) -> None:
    from tasks.full_pipeline import _compress_video

    mock_run.side_effect = [_ffprobe_result(has_audio=True), _ffmpeg_result(success=False)]
    r2 = _mock_r2()

    result = _compress_video(r2, "videos/original.mp4")

    assert result is None
    r2.put_object.assert_not_called()


def test_compress_video_r2_download_failure_returns_none() -> None:
    from tasks.full_pipeline import _compress_video

    r2 = MagicMock()
    r2.get_object.side_effect = Exception("R2 connection error")

    result = _compress_video(r2, "videos/original.mp4")

    assert result is None
