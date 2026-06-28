from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.challenge import Challenge


def _register(client: TestClient, email: str, username: str) -> tuple[str, dict]:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "password123"})
    data = res.json()["data"]
    return data["access_token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_post(client: TestClient, token: str, user_id: int, filename: str = "v.mp4") -> dict:
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        res = client.post("/api/v1/videos/confirm", json={
            "r2_key": f"videos/{user_id}/{filename}", "duration_sec": 15,
        }, headers=_auth(token))
    return res.json()["data"]["post"]


def _make_admin(db: Session, client: TestClient) -> str:
    from app.models.user import User
    res = client.post("/api/v1/auth/register", json={"email": "admin_u@x.com", "username": "admin_u", "password": "password123"})
    user_id = res.json()["data"]["user"]["id"]
    token = res.json()["data"]["access_token"]
    db.query(User).filter(User.id == user_id).update({"is_admin": True})
    db.commit()
    return token


def _make_challenge(db: Session, condition_value: int = 5) -> Challenge:
    now = datetime.now(timezone.utc)
    c = Challenge(
        title="테스트 챌린지",
        description="설명",
        reward_title="테스트 타이틀",
        condition_value=condition_value,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


# ── get_user_profile ─────────────────────────────────────────────────

def test_user_profile_not_found(client: TestClient) -> None:
    res = client.get("/api/v1/users/999/profile")
    assert res.status_code == 404


def test_user_profile_basic(client: TestClient) -> None:
    token, user = _register(client, "u@x.com", "pubuser")
    user_id = user["id"]

    res = client.get(f"/api/v1/users/{user_id}/profile")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["user"]["username"] == "pubuser"
    assert data["post_count"] == 0
    assert data["posts"] == []
    assert data["titles"] == []
    assert data["active_challenges"] == []


def test_user_profile_with_posts(client: TestClient) -> None:
    token, user = _register(client, "p@x.com", "poster")
    user_id = user["id"]

    _create_post(client, token, user_id, "v1.mp4")
    _create_post(client, token, user_id, "v2.mp4")

    res = client.get(f"/api/v1/users/{user_id}/profile")
    data = res.json()["data"]
    assert data["post_count"] == 2
    assert len(data["posts"]) == 2
    assert all("cdn_url" in p for p in data["posts"])


def test_user_profile_banned_returns_404(client: TestClient, db: Session) -> None:
    token, user = _register(client, "b@x.com", "banned")
    user_id = user["id"]

    # 직접 DB에서 ban 처리
    from app.models.user import User
    user = db.query(User).filter(User.id == user_id).first()
    assert user is not None
    user.is_banned = True
    db.commit()

    res = client.get(f"/api/v1/users/{user_id}/profile")
    assert res.status_code == 404


def test_user_profile_with_active_challenge(client: TestClient, db: Session) -> None:
    token, user = _register(client, "c@x.com", "challenger")
    user_id = user["id"]

    challenge = _make_challenge(db, condition_value=5)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))

    res = client.get(f"/api/v1/users/{user_id}/profile")
    data = res.json()["data"]
    assert len(data["active_challenges"]) == 1
    assert data["active_challenges"][0]["title"] == "테스트 챌린지"
    assert data["active_challenges"][0]["upload_count"] == 0
    assert data["titles"] == []


def test_user_profile_with_completed_title(client: TestClient, db: Session) -> None:
    token, user = _register(client, "t@x.com", "titled")
    user_id = user["id"]
    admin_token = _make_admin(db, client)

    challenge = _make_challenge(db, condition_value=1)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))

    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={
            "r2_key": f"videos/{user_id}/v.mp4", "duration_sec": 15, "challenge_id": challenge.id,
        }, headers=_auth(token))

    # 어드민 수동 완료 확정
    client.patch(f"/api/v1/challenges/{challenge.id}/participants/{user_id}/complete", headers=_auth(admin_token))

    res = client.get(f"/api/v1/users/{user_id}/profile")
    data = res.json()["data"]
    assert len(data["titles"]) == 1
    assert data["titles"][0]["title"] == "테스트 타이틀"


def test_leaderboard_ranks_fixed_positive_rewards(client: TestClient, db: Session) -> None:
    from app.models.reward import RewardPoint
    from app.models.user import User

    first_token, first_user = _register(client, "first@x.com", "first")
    second_token, second_user = _register(client, "second@x.com", "second")
    banned_token, banned_user_data = _register(client, "banned_rank@x.com", "bannedrank")

    first_id = first_user["id"]
    second_id = second_user["id"]
    banned_id = banned_user_data["id"]

    db.add_all([
        RewardPoint(user_id=first_id, points=30, reason="upload", status="fixed"),
        RewardPoint(user_id=second_id, points=50, reason="upload", status="fixed"),
        RewardPoint(user_id=first_id, points=100, reason="upload", status="queued"),
        RewardPoint(user_id=banned_id, points=999, reason="upload", status="fixed"),
    ])
    banned_user = db.query(User).filter(User.id == banned_id).first()
    assert banned_user is not None
    banned_user.is_banned = True
    db.commit()

    res = client.get("/api/v1/users/leaderboard")

    assert res.status_code == 200
    assert res.json()["data"] == [
        {"rank": 1, "user_id": second_id, "username": "second", "avatar_url": None, "total_points": 50},
        {"rank": 2, "user_id": first_id, "username": "first", "avatar_url": None, "total_points": 30},
    ]


def test_weekly_leaderboard_ignores_client_timezone_header(client: TestClient, db: Session) -> None:
    from app.models.reward import RewardPoint
    from app.services.reward import UTC, get_week_range

    token, user = _register(client, "tzboard@x.com", "tzboard")
    assert token
    from app.services.reward import KST
    week_start_utc, _week_end_utc = get_week_range(KST)
    db.add(RewardPoint(
        user_id=user["id"],
        points=12,
        reason="upload",
        status="fixed",
        created_at=week_start_utc + timedelta(seconds=1),
    ))
    db.commit()

    res = client.get(
        "/api/v1/users/leaderboard?period=week",
        headers={"X-Client-Timezone": "America/Adak"},
    )

    assert res.status_code == 200
    row = next(item for item in res.json()["data"] if item["user_id"] == user["id"])
    assert row["total_points"] == 12
