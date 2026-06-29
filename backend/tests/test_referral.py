"""친구 초대 (referral, 보상 없음) 테스트."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from tests.test_videos import _auth


def _register_full(client: TestClient, email: str, username: str, referral_code: str | None = None) -> dict:
    body = {"email": email, "username": username, "password": "password123"}
    if referral_code is not None:
        body["referral_code"] = referral_code
    res = client.post("/api/v1/auth/register", json=body)
    return res.json()["data"]


def test_register_generates_referral_code(client: TestClient, db: Session) -> None:
    data = _register_full(client, "ref1@x.com", "ref1")
    user = db.query(User).filter(User.id == data["user"]["id"]).first()
    assert user.referral_code
    assert len(user.referral_code) >= 8


def test_me_referral_returns_code_and_count(client: TestClient) -> None:
    data = _register_full(client, "ref2@x.com", "ref2")
    token = data["access_token"]
    res = client.get("/api/v1/users/me/referral", headers=_auth(token))
    assert res.status_code == 200, res.text
    body = res.json()["data"]
    assert body["referral_code"]
    assert body["invited_count"] == 0


def test_referral_links_referred_by(client: TestClient, db: Session) -> None:
    inviter = _register_full(client, "inviter@x.com", "inviter")
    inviter_token = inviter["access_token"]
    code = client.get("/api/v1/users/me/referral", headers=_auth(inviter_token)).json()["data"]["referral_code"]

    invitee = _register_full(client, "invitee@x.com", "invitee", referral_code=code)
    invitee_user = db.query(User).filter(User.id == invitee["user"]["id"]).first()
    assert invitee_user.referred_by_id == inviter["user"]["id"]

    # 초대자 집계 1
    res = client.get("/api/v1/users/me/referral", headers=_auth(inviter_token))
    assert res.json()["data"]["invited_count"] == 1


def test_invalid_referral_code_ignored(client: TestClient, db: Session) -> None:
    data = _register_full(client, "badref@x.com", "badref", referral_code="NONEXISTENT")
    user = db.query(User).filter(User.id == data["user"]["id"]).first()
    assert user.referred_by_id is None  # 무시되고 가입은 성공
    assert user.referral_code  # 본인 코드는 발급됨


def test_referral_codes_unique(client: TestClient, db: Session) -> None:
    a = _register_full(client, "uq_a@x.com", "uqa")
    b = _register_full(client, "uq_b@x.com", "uqb")
    ua = db.query(User).filter(User.id == a["user"]["id"]).first()
    ub = db.query(User).filter(User.id == b["user"]["id"]).first()
    assert ua.referral_code != ub.referral_code


def test_me_referral_unauthenticated(client: TestClient) -> None:
    res = client.get("/api/v1/users/me/referral")
    assert res.status_code in (401, 403)
