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


@patch("tasks.full_pipeline.subprocess.run")
def test_compress_video_with_audio(mock_run) -> None:
    from tasks.full_pipeline import _compress_video

    mock_run.side_effect = [_ffprobe_result(has_audio=True), _ffmpeg_result()]
    r2 = _mock_r2()

    result = _compress_video(r2, "videos/original.mp4")

    assert result is not None
    assert result.startswith("videos/c-")
    assert result.endswith(".mp4")
    r2.get_object.assert_called_once()
    r2.put_object.assert_called_once()
    ffmpeg_cmd = mock_run.call_args_list[1][0][0]
    assert "-c:a" in ffmpeg_cmd
    assert "aac" in ffmpeg_cmd


@patch("tasks.full_pipeline.subprocess.run")
def test_compress_video_no_audio(mock_run) -> None:
    from tasks.full_pipeline import _compress_video

    mock_run.side_effect = [_ffprobe_result(has_audio=False), _ffmpeg_result()]
    r2 = _mock_r2()

    result = _compress_video(r2, "videos/silent.mp4")

    assert result is not None
    ffmpeg_cmd = mock_run.call_args_list[1][0][0]
    assert "-an" in ffmpeg_cmd


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
