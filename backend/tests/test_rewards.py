from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.reward import RewardPoint


def _reg(client: TestClient, email: str = "r@x.com", username: str = "ruser") -> tuple[str, dict]:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "password123"})
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


def test_daily_upload_count_uses_utc_window(client: TestClient, db: Session) -> None:
    from datetime import datetime, timedelta, timezone

    from app.models.video import Video
    from app.services.reward import get_daily_upload_count

    token, user = _reg(client, "utc-window@x.com", "utcwindow")
    assert token
    start_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    db.add(Video(
        user_id=user["id"],
        r2_key="videos/utc-window/old.mp4",
        cdn_url="https://cdn/old.mp4",
        file_hash="old",
        duration_sec=20,
        created_at=start_utc - timedelta(seconds=1),
    ))
    db.add(Video(
        user_id=user["id"],
        r2_key="videos/utc-window/current.mp4",
        cdn_url="https://cdn/current.mp4",
        file_hash="current",
        duration_sec=20,
        created_at=start_utc + timedelta(seconds=1),
    ))
    db.commit()

    assert get_daily_upload_count(db, user["id"]) == 1


def test_daily_limit_ignores_client_timezone_header(client: TestClient, db: Session) -> None:
    from datetime import datetime, timedelta, timezone

    from app.models.video import Video

    token, user = _reg(client, "tz-limit@x.com", "tzlimit")
    start_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    db.add_all([
        Video(
            user_id=user["id"],
            r2_key=f"videos/tz-limit/{idx}.mp4",
            cdn_url=f"https://cdn/{idx}.mp4",
            file_hash=f"tz-limit-{idx}",
            duration_sec=20,
            created_at=start_utc + timedelta(seconds=idx + 1),
        )
        for idx in range(3)
    ])
    db.commit()

    res = client.get(
        "/api/v1/videos/daily-limit",
        headers={**_auth(token), "X-Client-Timezone": "America/Adak"},
    )

    assert res.status_code == 200
    assert res.json()["data"]["count"] == 3


def test_reward_summary_ignores_client_timezone_header(client: TestClient, db: Session) -> None:
    from datetime import timedelta

    from app.services.reward import UTC, get_week_range

    token, user = _reg(client, "tz-reward@x.com", "tzreward")
    week_start_utc, _week_end_utc = get_week_range(UTC)
    db.add(RewardPoint(
        user_id=user["id"],
        points=0.5,
        reason="upload",
        status="fixed",
        created_at=week_start_utc + timedelta(seconds=1),
    ))
    db.commit()

    res = client.get(
        "/api/v1/rewards/summary",
        headers={**_auth(token), "X-Client-Timezone": "America/Adak"},
    )

    assert res.status_code == 200
    assert res.json()["data"]["current_week_points"] == 0.5
