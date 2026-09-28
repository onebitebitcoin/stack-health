from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.models.admin_log import AdminLog
from app.services import blink as blink_service


def _reg(client: TestClient, email: str = "a@x.com", username: str = "au") -> tuple[str, dict]:
    res = client.post(
        "/api/v1/auth/register",
        json={"email": email, "username": username, "password": "password123"},
    )
    data = res.json()["data"]
    return data["access_token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_admin_by_email(db: Session, email: str) -> None:
    from app.models.user import User

    user = db.query(User).filter(User.email == email).first()
    if user:
        user.is_admin = True
        db.commit()


def _reg_admin(client: TestClient, db: Session, email: str = "admin@x.com", username: str = "admin") -> str:
    token, _ = _reg(client, email=email, username=username)
    _make_admin_by_email(db, email)
    return token


@pytest.fixture
def configured_blink(monkeypatch):
    """BLINK_API_KEY가 설정된 상태를 흉내낸다."""
    monkeypatch.setattr(settings, "blink_api_key", "test-blink-key")
    monkeypatch.setattr(settings, "blink_wallet_id", "")
    monkeypatch.setattr(settings, "blink_test_max_sats", 10000)
    yield


def _mock_response(json_body: dict, status_code: int = 200):
    class _Resp:
        def __init__(self, body: dict, code: int) -> None:
            self._body = body
            self.status_code = code

        def json(self) -> dict:
            return self._body

    return _Resp(json_body, status_code)


WALLETS_OK = {
    "data": {
        "me": {
            "defaultAccount": {
                "wallets": [
                    {"id": "usd-wallet-id", "walletCurrency": "USD", "balance": 500},
                    {"id": "btc-wallet-id", "walletCurrency": "BTC", "balance": 123456},
                ]
            }
        }
    }
}


def _payment_send_response(status: str, errors: list | None = None) -> dict:
    return {
        "data": {
            "lnAddressPaymentSend": {
                "status": status,
                "errors": errors or [],
            }
        }
    }


# ── /blink/status ────────────────────────────────────────────────────────────


def test_blink_status_not_configured(client: TestClient, db: Session) -> None:
    admin_token = _reg_admin(client, db)
    res = client.get("/api/v1/admin/blink/status", headers=_auth(admin_token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["configured"] is False
    assert data["wallet_id"] is None
    assert data["balance_sats"] is None
    assert data["error"] is None


def test_blink_status_configured_success(client: TestClient, db: Session, configured_blink) -> None:
    admin_token = _reg_admin(client, db)
    with patch("app.services.blink.httpx.post", return_value=_mock_response(WALLETS_OK)):
        res = client.get("/api/v1/admin/blink/status", headers=_auth(admin_token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["configured"] is True
    assert data["wallet_id"] == "btc-wallet-id"
    assert data["balance_sats"] == 123456
    assert data["error"] is None


def test_blink_status_configured_but_blink_unreachable(client: TestClient, db: Session, configured_blink) -> None:
    admin_token = _reg_admin(client, db)
    with patch("app.services.blink.httpx.post", side_effect=httpx.ConnectError("boom")):
        res = client.get("/api/v1/admin/blink/status", headers=_auth(admin_token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["configured"] is True
    assert data["wallet_id"] is None
    assert data["error"]


def test_blink_status_requires_admin(client: TestClient) -> None:
    token, _ = _reg(client, email="user@x.com", username="normaluser")
    res = client.get("/api/v1/admin/blink/status", headers=_auth(token))
    assert res.status_code == 403


# ── /blink/test-payout ───────────────────────────────────────────────────────


def test_blink_test_payout_success(client: TestClient, db: Session, configured_blink) -> None:
    admin_token = _reg_admin(client, db)
    responses = [
        _mock_response(WALLETS_OK),
        _mock_response(_payment_send_response("SUCCESS")),
    ]
    with patch("app.services.blink.httpx.post", side_effect=responses):
        res = client.post(
            "/api/v1/admin/blink/test-payout",
            json={"ln_address": "Someone@Example.com", "amount_sats": 100, "memo": "테스트"},
            headers=_auth(admin_token),
        )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["status"] == "SUCCESS"
    assert data["ln_address"] == "someone@example.com"  # 소문자 정규화
    assert data["amount_sats"] == 100

    log = db.query(AdminLog).filter(AdminLog.action == "blink_test_payout").first()
    assert log is not None
    assert log.target_type == "lightning_address"
    assert log.target_id == 0
    assert "someone@example.com" in log.detail
    assert "100" in log.detail
    assert "SUCCESS" in log.detail


def test_blink_test_payout_pending(client: TestClient, db: Session, configured_blink) -> None:
    admin_token = _reg_admin(client, db)
    responses = [
        _mock_response(WALLETS_OK),
        _mock_response(_payment_send_response("PENDING")),
    ]
    with patch("app.services.blink.httpx.post", side_effect=responses):
        res = client.post(
            "/api/v1/admin/blink/test-payout",
            json={"ln_address": "someone@example.com", "amount_sats": 50},
            headers=_auth(admin_token),
        )
    assert res.status_code == 200, res.text
    assert res.json()["data"]["status"] == "PENDING"


def test_blink_test_payout_failure_status_returns_502(client: TestClient, db: Session, configured_blink) -> None:
    admin_token = _reg_admin(client, db)
    responses = [
        _mock_response(WALLETS_OK),
        _mock_response(_payment_send_response("FAILURE")),
    ]
    with patch("app.services.blink.httpx.post", side_effect=responses):
        res = client.post(
            "/api/v1/admin/blink/test-payout",
            json={"ln_address": "someone@example.com", "amount_sats": 50},
            headers=_auth(admin_token),
        )
    assert res.status_code == 502
    body = res.json()["detail"]
    assert body["code"] == "E_BLINK_PAYMENT_FAILED"

    log = db.query(AdminLog).filter(AdminLog.action == "blink_test_payout").first()
    assert log is not None
    assert "FAILURE" in log.detail or "실패" in log.detail


def test_blink_test_payout_graphql_error_returns_502(client: TestClient, db: Session, configured_blink) -> None:
    admin_token = _reg_admin(client, db)
    responses = [
        _mock_response(WALLETS_OK),
        _mock_response({"errors": [{"message": "insufficient balance"}]}),
    ]
    with patch("app.services.blink.httpx.post", side_effect=responses):
        res = client.post(
            "/api/v1/admin/blink/test-payout",
            json={"ln_address": "someone@example.com", "amount_sats": 50},
            headers=_auth(admin_token),
        )
    assert res.status_code == 502
    assert res.json()["detail"]["code"] == "E_BLINK_PAYMENT_FAILED"
    assert "insufficient balance" in res.json()["detail"]["message"]


def test_blink_test_payout_not_configured_returns_503(client: TestClient, db: Session) -> None:
    admin_token = _reg_admin(client, db)
    res = client.post(
        "/api/v1/admin/blink/test-payout",
        json={"ln_address": "someone@example.com", "amount_sats": 50},
        headers=_auth(admin_token),
    )
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "E_BLINK_NOT_CONFIGURED"


def test_blink_test_payout_invalid_address(client: TestClient, db: Session, configured_blink) -> None:
    admin_token = _reg_admin(client, db)
    res = client.post(
        "/api/v1/admin/blink/test-payout",
        json={"ln_address": "not-an-address", "amount_sats": 50},
        headers=_auth(admin_token),
    )
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "E_BLINK_INVALID_ADDRESS"


def test_blink_test_payout_amount_out_of_range(client: TestClient, db: Session, configured_blink) -> None:
    admin_token = _reg_admin(client, db)

    res_zero = client.post(
        "/api/v1/admin/blink/test-payout",
        json={"ln_address": "someone@example.com", "amount_sats": 0},
        headers=_auth(admin_token),
    )
    assert res_zero.status_code == 422
    assert res_zero.json()["detail"]["code"] == "E_BLINK_AMOUNT_OUT_OF_RANGE"

    res_over = client.post(
        "/api/v1/admin/blink/test-payout",
        json={"ln_address": "someone@example.com", "amount_sats": settings.blink_test_max_sats + 1},
        headers=_auth(admin_token),
    )
    assert res_over.status_code == 422
    assert res_over.json()["detail"]["code"] == "E_BLINK_AMOUNT_OUT_OF_RANGE"


def test_blink_test_payout_memo_too_long(client: TestClient, db: Session, configured_blink) -> None:
    admin_token = _reg_admin(client, db)
    res = client.post(
        "/api/v1/admin/blink/test-payout",
        json={"ln_address": "someone@example.com", "amount_sats": 50, "memo": "x" * 101},
        headers=_auth(admin_token),
    )
    assert res.status_code == 422


def test_blink_test_payout_requires_admin(client: TestClient, configured_blink) -> None:
    token, _ = _reg(client, email="user@x.com", username="normaluser")
    res = client.post(
        "/api/v1/admin/blink/test-payout",
        json={"ln_address": "someone@example.com", "amount_sats": 50},
        headers=_auth(token),
    )
    assert res.status_code == 403


# ── app.services.blink 단위 테스트 (네트워크 mock) ───────────────────────────


def test_blink_service_not_configured_raises() -> None:
    assert blink_service.is_configured() is False
    with pytest.raises(blink_service.BlinkError):
        blink_service.get_btc_wallet()


def test_blink_service_http_error_status(configured_blink) -> None:
    with (
        patch("app.services.blink.httpx.post", return_value=_mock_response({}, status_code=500)),
        pytest.raises(blink_service.BlinkError, match="HTTP 500"),
    ):
        blink_service.get_btc_wallet()


def test_blink_service_network_error(configured_blink) -> None:
    with (
        patch("app.services.blink.httpx.post", side_effect=httpx.ConnectError("boom")),
        pytest.raises(blink_service.BlinkError),
    ):
        blink_service.get_btc_wallet()


def test_blink_service_unparsable_json(configured_blink) -> None:
    class _BadJsonResp:
        status_code = 200

        def json(self):
            raise ValueError("not json")

    with (
        patch("app.services.blink.httpx.post", return_value=_BadJsonResp()),
        pytest.raises(blink_service.BlinkError, match="해석"),
    ):
        blink_service.get_btc_wallet()


def test_blink_service_wallet_id_configured_but_not_found(monkeypatch, configured_blink) -> None:
    monkeypatch.setattr(settings, "blink_wallet_id", "does-not-exist")
    with (
        patch("app.services.blink.httpx.post", return_value=_mock_response(WALLETS_OK)),
        pytest.raises(blink_service.BlinkError, match="BLINK_WALLET_ID"),
    ):
        blink_service.get_btc_wallet()


def test_blink_service_wallet_id_configured_and_found(monkeypatch, configured_blink) -> None:
    monkeypatch.setattr(settings, "blink_wallet_id", "usd-wallet-id")
    with patch("app.services.blink.httpx.post", return_value=_mock_response(WALLETS_OK)):
        wallet_id, balance = blink_service.get_btc_wallet()
    assert wallet_id == "usd-wallet-id"
    assert balance == 500


def test_blink_service_no_btc_wallet_found(configured_blink) -> None:
    no_btc = {
        "data": {
            "me": {"defaultAccount": {"wallets": [{"id": "usd-wallet-id", "walletCurrency": "USD", "balance": 500}]}}
        }
    }
    with (
        patch("app.services.blink.httpx.post", return_value=_mock_response(no_btc)),
        pytest.raises(blink_service.BlinkError, match="BTC 지갑"),
    ):
        blink_service.get_btc_wallet()


def test_blink_service_send_field_level_errors(configured_blink) -> None:
    responses = [
        _mock_response(WALLETS_OK),
        _mock_response(_payment_send_response("FAILURE", errors=[{"code": "X", "message": "denied", "path": None}])),
    ]
    with (
        patch("app.services.blink.httpx.post", side_effect=responses),
        pytest.raises(blink_service.BlinkError, match="denied"),
    ):
        blink_service.send_to_lightning_address("someone@example.com", 10)


def test_blink_service_send_missing_status(configured_blink) -> None:
    responses = [
        _mock_response(WALLETS_OK),
        _mock_response({"data": {"lnAddressPaymentSend": {"status": None, "errors": []}}}),
    ]
    with (
        patch("app.services.blink.httpx.post", side_effect=responses),
        pytest.raises(blink_service.BlinkError, match="상태"),
    ):
        blink_service.send_to_lightning_address("someone@example.com", 10)


def test_send_timeout_warns_payment_may_have_been_sent() -> None:
    """타임아웃은 실패로 단정하지 않고 전송 여부 확인을 안내한다(이중 지급 방지)."""
    with (
        patch.object(settings, "blink_api_key", "k"),
        patch("app.services.blink.httpx.post", side_effect=httpx.ReadTimeout("slow")),
        pytest.raises(blink_service.BlinkError, match="실제 전송 여부"),
    ):
        blink_service.send_to_lightning_address("a@b.com", 10)
