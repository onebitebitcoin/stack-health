from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def _reg(client: TestClient, email: str = "a@x.com", username: str = "au") -> str:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "pw"})
    return res.json()["data"]["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_admin_by_email(db: Session, email: str) -> None:
    from app.models.user import User
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.is_admin = True
        db.commit()


def _age_queued_rewards(db: Session) -> None:
    from app.models.reward import RewardPoint
    cutoff = datetime.utcnow() - timedelta(days=1, seconds=1)
    for reward in db.query(RewardPoint).filter(RewardPoint.status == "queued").all():
        reward.created_at = cutoff
    db.commit()


def _reg_admin(client: TestClient, db: Session, email: str = "admin@x.com", username: str = "admin") -> str:
    token = _reg(client, email=email, username=username)
    _make_admin_by_email(db, email)
    return token


def _upload_and_claim(client: TestClient, db: Session, user_token: str) -> int:
    for i in range(2):
        with patch("app.routes.videos.r2_service.get_cdn_url", return_value=f"https://cdn/v{i}.mp4"):
            client.post("/api/v1/videos/confirm", json={"r2_key": f"videos/v{i}.mp4", "duration_sec": 20}, headers=_auth(user_token))
    _age_queued_rewards(db)
    client.patch("/api/v1/auth/me", json={"lightning_address": "u@w.com"}, headers=_auth(user_token))
    with patch("app.routes.rewards.MIN_CLAIM_SATS", 10):
        res = client.post("/api/v1/rewards/claim", json={}, headers=_auth(user_token))
    return res.json()["data"]["claim"]["id"]


def test_admin_claims_no_key(client: TestClient) -> None:
    res = client.get("/api/v1/admin/claims")
    assert res.status_code == 401


def test_admin_claims_wrong_key(client: TestClient) -> None:
    token = _reg(client)
    res = client.get("/api/v1/admin/claims", headers=_auth(token))
    assert res.status_code == 403


def test_admin_claims_list(client: TestClient, db: Session) -> None:
    admin_token = _reg_admin(client, db)
    user_token = _reg(client, email="user@x.com", username="user1")
    _upload_and_claim(client, db, user_token)
    res = client.get("/api/v1/admin/claims", headers=_auth(admin_token))
    assert res.status_code == 200
    claims = res.json()["data"]["claims"]
    assert len(claims) == 1
    assert claims[0]["status"] == "pending"


def test_admin_mark_paid(client: TestClient, db: Session) -> None:
    admin_token = _reg_admin(client, db)
    user_token = _reg(client, email="user@x.com", username="user1")
    claim_id = _upload_and_claim(client, db, user_token)
    res = client.patch(
        f"/api/v1/admin/claims/{claim_id}/mark-paid",
        headers=_auth(admin_token),
        params={"payment_memo": "sent via Zeus"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["claim"]["status"] == "paid"


def test_admin_videos_list(client: TestClient, db: Session) -> None:
    admin_token = _reg_admin(client, db)
    user_token = _reg(client, email="user@x.com", username="user1")
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": "videos/v.mp4", "duration_sec": 20}, headers=_auth(user_token))
    res = client.get("/api/v1/admin/videos", headers=_auth(admin_token))
    assert res.status_code == 200
    assert len(res.json()["data"]["videos"]) == 1


def test_admin_reject_video(client: TestClient, db: Session) -> None:
    admin_token = _reg_admin(client, db)
    user_token = _reg(client, email="user@x.com", username="user1")
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": "videos/v.mp4", "duration_sec": 20}, headers=_auth(user_token))
    videos = client.get("/api/v1/admin/videos", headers=_auth(admin_token)).json()["data"]["videos"]
    vid_id = videos[0]["id"]

    res = client.patch(f"/api/v1/admin/videos/{vid_id}/reject", headers=_auth(admin_token))
    assert res.status_code == 200
    assert res.json()["data"]["video"]["status"] == "rejected"
