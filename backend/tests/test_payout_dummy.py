from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.models.admin_log import AdminLog
from app.services import payout as payout_service


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


URL = "/api/v1/admin/blink/test-payout"
STATUS_URL = "/api/v1/admin/blink/status"


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """더미 모드는 어떤 네트워크 호출도 하면 안 된다."""
    import httpx

    def _boom(*args, **kwargs):
        raise AssertionError("network call attempted")

    monkeypatch.setattr(httpx, "post", _boom)
    monkeypatch.setattr(settings, "payout_test_max_sats", 10000)


def test_status_is_dummy(client: TestClient, db: Session) -> None:
    token = _reg_admin(client, db)
    res = client.get(STATUS_URL, headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["dummy"] is True
    assert data["wallet_id"] is None
    assert data["balance_sats"] is None
    assert data["max_test_sats"] == 10000
    assert data["error"] is None


def test_status_requires_admin(client: TestClient) -> None:
    token, _ = _reg(client, email="u@x.com", username="plain")
    assert client.get(STATUS_URL, headers=_auth(token)).status_code == 403
    assert client.get(STATUS_URL).status_code in (401, 403)


def test_test_payout_returns_dummy_result_and_logs(client: TestClient, db: Session) -> None:
    token = _reg_admin(client, db)
    res = client.post(
        URL,
        json={"ln_address": "User@Example.com", "amount_sats": 100, "memo": "hi"},
        headers=_auth(token),
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["status"] == "DUMMY"
    assert data["dummy"] is True
    assert data["ln_address"] == "user@example.com"
    assert data["amount_sats"] == 100
    assert data["payment_hash"].startswith("dummy-")

    log = db.query(AdminLog).filter(AdminLog.action == "payout_test_dummy").one()
    assert "[dummy]" in log.detail
    assert "user@example.com" in log.detail
    assert "100 sats" in log.detail


def test_test_payout_invalid_address(client: TestClient, db: Session) -> None:
    token = _reg_admin(client, db)
    res = client.post(URL, json={"ln_address": "not-an-address", "amount_sats": 100}, headers=_auth(token))
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "E_PAYOUT_INVALID_ADDRESS"
    assert db.query(AdminLog).filter(AdminLog.action == "payout_test_dummy").count() == 0


@pytest.mark.parametrize("amount", [0, -5, 10001])
def test_test_payout_amount_out_of_range(client: TestClient, db: Session, amount: int) -> None:
    token = _reg_admin(client, db)
    res = client.post(URL, json={"ln_address": "a@b.com", "amount_sats": amount}, headers=_auth(token))
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "E_PAYOUT_AMOUNT_OUT_OF_RANGE"


def test_test_payout_memo_too_long(client: TestClient, db: Session) -> None:
    token = _reg_admin(client, db)
    res = client.post(
        URL,
        json={"ln_address": "a@b.com", "amount_sats": 10, "memo": "x" * 101},
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_test_payout_requires_admin(client: TestClient) -> None:
    token, _ = _reg(client, email="u@x.com", username="plain")
    res = client.post(URL, json={"ln_address": "a@b.com", "amount_sats": 10}, headers=_auth(token))
    assert res.status_code == 403


def test_service_returns_unique_dummy_hashes() -> None:
    a = payout_service.send_to_lightning_address("a@b.com", 5, None)
    b = payout_service.send_to_lightning_address("a@b.com", 5, None)
    assert a["status"] == "DUMMY"
    assert a["sats"] == 5
    assert a["payment_hash"] != b["payment_hash"]


def test_service_rejects_out_of_range_amount() -> None:
    with pytest.raises(payout_service.PayoutError):
        payout_service.send_to_lightning_address("a@b.com", 0, None)
