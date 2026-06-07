"""dev(staging) 워커에서는 텔레그램 알림이 전송되지 않고, 운영(production) 워커에서만 전송되는지 확인."""

from __future__ import annotations

from unittest.mock import patch


@patch("notify.subprocess.run")
@patch("notify.ENVIRONMENT", "staging")
def test_send_skipped_when_not_production(mock_run) -> None:
    from notify import _send

    _send("[Event] 테스트 메시지")

    mock_run.assert_not_called()


@patch("notify.subprocess.run")
@patch("notify.ENVIRONMENT", "production")
def test_send_dispatched_when_production(mock_run) -> None:
    from notify import _send

    _send("[Event] 테스트 메시지")

    mock_run.assert_called_once()
    assert mock_run.call_args.args[0][:1] == ["bash"]
