from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.reward import RewardPoint


def _reg(client: TestClient, email: str = "r@x.com", username: str = "ruser") -> tuple[str, dict]:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "pw"})
    data = res.json()["data"]
    return data["access_token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _upload(client: TestClient, token: str, key: str = "videos/v.mp4") -> None:
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": key, "duration_sec": 20}, headers=_auth(token))


def _age_queued_rewards(db: Session) -> None:
    cutoff = datetime.utcnow() - timedelta(days=1, seconds=1)
    for reward in db.query(RewardPoint).filter(RewardPoint.status == "queued").all():
        reward.created_at = cutoff
    db.commit()


def test_summary_returns_week_label(client: TestClient) -> None:
    token, _ = _reg(client)
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert "week_label" in data
    assert data["week_label"].startswith("20")


def test_summary_points_after_upload(client: TestClient) -> None:
    token, _ = _reg(client)
    _upload(client, token)
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    data = res.json()["data"]
    # Early adopter upload reward is queued for 24 hours before becoming claimable.
    assert data["current_week_points"] == 0
    assert data["fixed_week_points"] == 0
    assert data["queued_week_points"] == 100
    assert data["satoshi_amount"] == 0
    assert data["claimable"] is False


def test_summary_moves_queued_upload_reward_to_fixed_after_one_day(client: TestClient, db: Session) -> None:
    token, _ = _reg(client, "settle@x.com", "settleuser")
    _upload(client, token, "videos/settle.mp4")
    _age_queued_rewards(db)

    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    data = res.json()["data"]
    assert data["current_week_points"] == 100
    assert data["fixed_week_points"] == 100
    assert data["queued_week_points"] == 0
    assert data["satoshi_amount"] == 1000
    assert data["claimable"] is True


def test_delete_retrieves_queued_upload_reward(client: TestClient) -> None:
    token, _ = _reg(client, "revoke@x.com", "revokeuser")
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/revoke.mp4"):
        upload_res = client.post(
            "/api/v1/videos/confirm",
            json={"r2_key": "videos/revoke.mp4", "duration_sec": 20},
            headers=_auth(token),
        )
    post_id = upload_res.json()["data"]["post"]["id"]

    with patch("app.routes.videos.r2_service.delete_object"):
        delete_res = client.delete(f"/api/v1/videos/posts/{post_id}", headers=_auth(token))
    assert delete_res.status_code == 200

    summary_res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    data = summary_res.json()["data"]
    assert data["current_week_points"] == 0
    assert data["queued_week_points"] == 0
    assert data["satoshi_amount"] == 0


def test_claim_requires_minimum_sats(client: TestClient) -> None:
    token, _ = _reg(client)
    # No upload → 0 sats → below minimum
    res = client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    assert res.status_code == 400


def test_claim_success(client: TestClient, db: Session) -> None:
    token, _ = _reg(client)
    # Upload once to get 100pt (2x early adopter bonus) = 1000 sats (minimum)
    _upload(client, token, "videos/v1.mp4")
    _age_queued_rewards(db)
    # 100pt (2x bonus) = 1000 sats

    # Set lightning address first
    client.patch("/api/v1/auth/me", json={"lightning_address": "user@walletofsatoshi.com"}, headers=_auth(token))

    res = client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    assert res.status_code == 200
    claim = res.json()["data"]["claim"]
    assert claim["status"] == "pending"
    assert claim["satoshi_amount"] == 1000


def test_claim_duplicate_same_week(client: TestClient, db: Session) -> None:
    token, _ = _reg(client)
    _upload(client, token, "videos/v1.mp4")
    _upload(client, token, "videos/v2.mp4")
    _age_queued_rewards(db)
    client.patch("/api/v1/auth/me", json={"lightning_address": "u@w.com"}, headers=_auth(token))

    client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    res = client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    assert res.status_code == 409


def test_claim_list(client: TestClient, db: Session) -> None:
    token, _ = _reg(client)
    _upload(client, token, "videos/v1.mp4")
    _upload(client, token, "videos/v2.mp4")
    _age_queued_rewards(db)
    client.patch("/api/v1/auth/me", json={"lightning_address": "u@w.com"}, headers=_auth(token))
    client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))

    res = client.get("/api/v1/rewards/claims", headers=_auth(token))
    assert res.status_code == 200
    assert len(res.json()["data"]["claims"]) == 1


def test_satoshi_calculation(client: TestClient, db: Session) -> None:
    """Early adopter gets 2x bonus: 50pt * 2 = 100pt = 1000 sats (meets minimum)."""
    token, _ = _reg(client)
    _upload(client, token)  # +100pt (2x early adopter bonus)
    _age_queued_rewards(db)
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    data = res.json()["data"]
    assert data["satoshi_amount"] == 1000
    assert data["claimable"] is True  # 1000 >= 1000 min
