"""최우선 수정 1~4 회귀 테스트.

- Fix 3: _audio_merge가 클라이언트 정수 대신 실제 오디오 길이를 probe해서 -t를 결정한다.
- Fix 4: 오디오 머지 실패가 성공 알림에 경고로 노출된다.
"""

from __future__ import annotations

import subprocess
from io import BytesIO
from unittest.mock import MagicMock, patch


def _cp(stdout: str = "", returncode: int = 0, stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


@patch("tasks.full_pipeline.subprocess.run")
def test_audio_merge_uses_probed_audio_not_client_value(mock_run) -> None:
    """클라이언트가 3초로 잘못 보고해도 실제 오디오(9초)를 probe해 -t 9로 머지한다."""
    from tasks.full_pipeline import _audio_merge

    # 1) video probe → 5.0초, 2) audio probe(format=duration) → 9.0초, 3) ffmpeg 머지 → 성공
    mock_run.side_effect = [_cp("5.0\n"), _cp("9.0\n"), _cp(returncode=0)]
    r2 = MagicMock()
    r2.get_object.return_value = {"Body": BytesIO(b"x")}
    r2.put_object.return_value = {}

    result = _audio_merge(r2, "videos/v.mp4", "audio/a.webm", 3.0, ".webm")

    assert result is not None and result.startswith("videos/merged-")
    merge_cmd = mock_run.call_args_list[-1][0][0]
    ti = merge_cmd.index("-t")
    # 클라이언트 값(3)이 아니라 probe된 실제 오디오(9.0)로 출력 길이를 잡아야 한다.
    assert merge_cmd[ti + 1] == "9.0", f"probed 9초가 아닌 {merge_cmd[ti + 1]} 사용됨"
    # audio > video → video를 루프하는 분기
    assert "-stream_loop" in merge_cmd


@patch("tasks.full_pipeline.subprocess.run")
def test_audio_merge_falls_back_to_client_when_probe_fails(mock_run) -> None:
    """오디오 probe가 모두 실패하면 클라이언트 값으로 fallback한다(무회귀)."""
    from tasks.full_pipeline import _audio_merge

    # video=10초, audio probe 메타 2회 N/A + 디코드 패스도 time= 없음 → 0 → 클라이언트 4초 fallback
    mock_run.side_effect = [
        _cp("10.0\n"),          # video probe
        _cp("N/A\n"),           # audio format=duration
        _cp("N/A\n"),           # audio a:0 stream=duration
        _cp(stderr="no time"),  # 디코드 패스 (time= 매칭 실패)
        _cp(returncode=0),      # ffmpeg 머지
    ]
    r2 = MagicMock()
    r2.get_object.return_value = {"Body": BytesIO(b"x")}
    r2.put_object.return_value = {}

    result = _audio_merge(r2, "videos/v.mp4", "audio/a.webm", 4.0, ".webm")

    assert result is not None
    merge_cmd = mock_run.call_args_list[-1][0][0]
    ti = merge_cmd.index("-t")
    # video(10) >= audio(4) → video copy 분기, -t는 video_duration(10.0)
    assert merge_cmd[ti + 1] == "10.0"


@patch("notify._send")
def test_notify_success_flags_audio_merge_failure(mock_send) -> None:
    """audio_merge_failed=True면 성공 알림에 음성 머지 실패 경고가 포함된다."""
    from notify import notify_video_success

    job = {"job_id": "j1", "user_id": 7, "audio_r2_key": "audio/a.webm"}
    result = {"audio_merge_failed": True, "merge_type": "video", "username": "u", "email": "e"}

    notify_video_success(job, result)

    msg = mock_send.call_args[0][0]
    assert "음성 머지 실패" in msg


@patch("notify._send")
def test_notify_success_no_audio_warn_when_ok(mock_send) -> None:
    """오디오 머지 성공 시에는 경고가 없다."""
    from notify import notify_video_success

    job = {"job_id": "j1", "user_id": 7, "audio_r2_key": "audio/a.webm"}
    result = {"audio_merge_failed": False, "merge_type": "video + audio", "username": "u", "email": "e"}

    notify_video_success(job, result)

    msg = mock_send.call_args[0][0]
    assert "음성 머지 실패" not in msg
