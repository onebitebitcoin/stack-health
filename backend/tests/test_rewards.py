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


def test_summary_returns_week_label(client: TestClient) -> None:
    token, _ = _reg(client)
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert "week_label" in data
    assert data["week_label"].startswith("20")


def test_summary_points_after_upload(client: TestClient) -> None:
    token, user = _reg(client)
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


def test_claim_list_empty(client: TestClient) -> None:
    token, _ = _reg(client, "list@x.com", "listuser")
    res = client.get("/api/v1/rewards/claims", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["data"]["claims"] == []


# ── Bitcoin challenge claim tests ─────────────────────────────────────────────

def _create_bitcoin_challenge(client: TestClient, token: str, sats: int = 1000) -> int:
    res = client.post(
        "/api/v1/challenges",
        json={
            "title": "BTC 챌린지",
            "description": "완료하면 비트코인!",
            "reward_title": "Bitcoin 보상",
            "condition_value": 1,
            "start_date": "2026-01-01T00:00:00Z",
            "end_date": "2026-12-31T23:59:59Z",
            "bitcoin_reward_sats": sats,
        },
        headers=_auth(token),
    )
    assert res.status_code == 200
    return res.json()["data"]["challenge"]["id"]


def test_bitcoin_claim_requires_completion(client: TestClient) -> None:
    token, user = _reg(client, "btc1@x.com", "btcuser1")
    challenge_id = _create_bitcoin_challenge(client, token)

    client.post(f"/api/v1/challenges/{challenge_id}/join", headers=_auth(token))
    client.patch("/api/v1/auth/me", json={"lightning_address": "u@wallet.com"}, headers=_auth(token))

    res = client.post(f"/api/v1/challenges/{challenge_id}/claim-bitcoin", json={}, headers=_auth(token))
    assert res.status_code == 400


def test_bitcoin_claim_success(client: TestClient) -> None:
    token, user = _reg(client, "btc2@x.com", "btcuser2")
    challenge_id = _create_bitcoin_challenge(client, token, sats=5000)

    client.post(f"/api/v1/challenges/{challenge_id}/join", headers=_auth(token))
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": f"videos/{user['id']}/c.mp4", "duration_sec": 10, "challenge_id": challenge_id}, headers=_auth(token))

    client.patch("/api/v1/auth/me", json={"lightning_address": "u@wallet.com"}, headers=_auth(token))
    res = client.post(f"/api/v1/challenges/{challenge_id}/claim-bitcoin", json={}, headers=_auth(token))
    assert res.status_code == 200
    claim = res.json()["data"]["claim"]
    assert claim["satoshi_amount"] == 5000
    assert claim["status"] == "pending"
    assert claim["challenge_id"] == challenge_id


def test_bitcoin_claim_duplicate(client: TestClient) -> None:
    token, user = _reg(client, "btc3@x.com", "btcuser3")
    challenge_id = _create_bitcoin_challenge(client, token)

    client.post(f"/api/v1/challenges/{challenge_id}/join", headers=_auth(token))
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": f"videos/{user['id']}/d.mp4", "duration_sec": 10, "challenge_id": challenge_id}, headers=_auth(token))

    client.patch("/api/v1/auth/me", json={"lightning_address": "u@wallet.com"}, headers=_auth(token))
    client.post(f"/api/v1/challenges/{challenge_id}/claim-bitcoin", json={}, headers=_auth(token))
    res = client.post(f"/api/v1/challenges/{challenge_id}/claim-bitcoin", json={}, headers=_auth(token))
    assert res.status_code == 409


def test_no_bitcoin_reward_challenge_claim_rejected(client: TestClient) -> None:
    token, _ = _reg(client, "btc4@x.com", "btcuser4")
    res = client.post(
        "/api/v1/challenges",
        json={
            "title": "일반 챌린지",
            "description": "비트코인 없음",
            "reward_title": "타이틀만",
            "condition_value": 1,
            "start_date": "2026-01-01T00:00:00Z",
            "end_date": "2026-12-31T23:59:59Z",
        },
        headers=_auth(token),
    )
    challenge_id = res.json()["data"]["challenge"]["id"]

    client.patch("/api/v1/auth/me", json={"lightning_address": "u@wallet.com"}, headers=_auth(token))
    res = client.post(f"/api/v1/challenges/{challenge_id}/claim-bitcoin", json={}, headers=_auth(token))
    assert res.status_code == 400
