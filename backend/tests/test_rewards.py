from __future__ import annotations

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


def _upload(client: TestClient, token: str, user_id: int, filename: str = "v.mp4") -> None:
    key = f"videos/{user_id}/{filename}"
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": key, "duration_sec": 20}, headers=_auth(token))


def _age_queued_rewards(db: Session) -> None:
    """Backdate queued rewards past the 24h cutoff so settle_queued_rewards fixes them."""
    from datetime import datetime, timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(hours=25)
    for reward in db.query(RewardPoint).filter(RewardPoint.status == "queued").all():
        reward.created_at = cutoff
    db.commit()


def test_summary_returns_points(client: TestClient) -> None:
    token, _ = _reg(client)
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert "current_week_points" in data
    assert "fixed_week_points" in data
    assert "queued_week_points" in data


def test_summary_no_sats_field(client: TestClient) -> None:
    token, _ = _reg(client)
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    data = res.json()["data"]
    assert "satoshi_amount" not in data
    assert "claimable" not in data


def test_summary_points_after_upload(client: TestClient) -> None:
    token, user = _reg(client, "pts@x.com", "ptsuser")
    _upload(client, token, user["id"])
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    data = res.json()["data"]
    assert data["current_week_points"] == 0
    assert data["fixed_week_points"] == 0
    assert data["queued_week_points"] == 0.5


def test_summary_moves_queued_upload_reward_to_fixed_after_24h(client: TestClient, db: Session) -> None:
    token, user = _reg(client, "settle@x.com", "settleuser")
    _upload(client, token, user["id"], "settle.mp4")
    _age_queued_rewards(db)

    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    data = res.json()["data"]
    assert data["current_week_points"] == 0.5
    assert data["fixed_week_points"] == 0.5
    assert data["queued_week_points"] == 0


def test_delete_retrieves_queued_upload_reward(client: TestClient) -> None:
    token, user = _reg(client, "revoke@x.com", "revokeuser")
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/revoke.mp4"):
        upload_res = client.post(
            "/api/v1/videos/confirm",
            json={"r2_key": f"videos/{user['id']}/revoke.mp4", "duration_sec": 20},
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



def test_weekly_claim_endpoint_removed(client: TestClient) -> None:
    token, _ = _reg(client, "nc@x.com", "ncuser")
    res = client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    assert res.status_code in (404, 405)
