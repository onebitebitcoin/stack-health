from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.challenge import Challenge, ChallengeParticipation


def _register(client: TestClient, email: str, username: str) -> str:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "pw"})
    return res.json()["data"]["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_challenge(db: Session, title: str = "30일 챌린지", condition_value: int = 5, is_active: bool = True) -> Challenge:
    now = datetime.now(timezone.utc)
    c = Challenge(
        title=title,
        description="30일 연속 운동",
        reward_title="챌린지 마스터",
        condition_value=condition_value,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        is_active=is_active,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _confirm_upload(client: TestClient, token: str, r2_key: str = "v.mp4") -> None:
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={
            "r2_key": r2_key, "duration_sec": 15,
        }, headers=_auth(token))


# ── list_challenges ──────────────────────────────────────────────────

def test_list_challenges_empty(client: TestClient) -> None:
    res = client.get("/api/v1/challenges")
    assert res.status_code == 200
    assert res.json()["data"]["challenges"] == []


def test_list_challenges_active_only(client: TestClient, db: Session) -> None:
    _make_challenge(db, "활성 챌린지", is_active=True)
    _make_challenge(db, "종료 챌린지", is_active=False)
    res = client.get("/api/v1/challenges")
    assert res.status_code == 200
    titles = [c["title"] for c in res.json()["data"]["challenges"]]
    assert "활성 챌린지" in titles
    assert "종료 챌린지" not in titles


def test_list_challenges_search(client: TestClient, db: Session) -> None:
    _make_challenge(db, "러닝 챌린지")
    _make_challenge(db, "요가 챌린지")
    res = client.get("/api/v1/challenges?q=러닝")
    assert res.status_code == 200
    data = res.json()["data"]["challenges"]
    assert len(data) == 1
    assert data[0]["title"] == "러닝 챌린지"


def test_list_challenges_authenticated_shows_joined(client: TestClient, db: Session) -> None:
    token = _register(client, "u@x.com", "user1")
    challenge = _make_challenge(db)
    # 참여
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    res = client.get("/api/v1/challenges", headers=_auth(token))
    c = res.json()["data"]["challenges"][0]
    assert c["joined"] is True
    assert c["participant_count"] == 1


def test_list_challenges_unauthenticated_joined_false(client: TestClient, db: Session) -> None:
    _make_challenge(db)
    res = client.get("/api/v1/challenges")
    c = res.json()["data"]["challenges"][0]
    assert c["joined"] is False


# ── join_challenge ───────────────────────────────────────────────────

def test_join_challenge_success(client: TestClient, db: Session) -> None:
    token = _register(client, "j@x.com", "joiner")
    challenge = _make_challenge(db)
    res = client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["data"]["joined"] is True


def test_join_challenge_not_found(client: TestClient) -> None:
    token = _register(client, "j2@x.com", "joiner2")
    res = client.post("/api/v1/challenges/999/join", headers=_auth(token))
    assert res.status_code == 404


def test_join_challenge_inactive(client: TestClient, db: Session) -> None:
    token = _register(client, "j3@x.com", "joiner3")
    challenge = _make_challenge(db, is_active=False)
    res = client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    assert res.status_code == 400


def test_join_challenge_duplicate(client: TestClient, db: Session) -> None:
    token = _register(client, "j4@x.com", "joiner4")
    challenge = _make_challenge(db)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    res = client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    assert res.status_code == 409


def test_join_challenge_unauthenticated(client: TestClient, db: Session) -> None:
    challenge = _make_challenge(db)
    res = client.post(f"/api/v1/challenges/{challenge.id}/join")
    assert res.status_code in (401, 403)  # HTTPBearer returns 403 when no token


# ── my_challenges ────────────────────────────────────────────────────

def test_my_challenges_empty(client: TestClient) -> None:
    token = _register(client, "m@x.com", "myuser")
    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["data"]["challenges"] == []


def test_my_challenges_shows_joined(client: TestClient, db: Session) -> None:
    token = _register(client, "m2@x.com", "myuser2")
    challenge = _make_challenge(db)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    data = res.json()["data"]["challenges"]
    assert len(data) == 1
    assert data[0]["title"] == challenge.title


# ── my_titles ────────────────────────────────────────────────────────

def test_my_titles_empty(client: TestClient) -> None:
    token = _register(client, "t@x.com", "titleuser")
    res = client.get("/api/v1/challenges/titles", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["data"]["titles"] == []


def test_my_titles_after_completion(client: TestClient, db: Session) -> None:
    token = _register(client, "t2@x.com", "titleuser2")
    challenge = _make_challenge(db, condition_value=1)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    # 업로드 1회 → 조건 충족
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={
            "r2_key": "v.mp4", "duration_sec": 15, "challenge_id": challenge.id,
        }, headers=_auth(token))
    res = client.get("/api/v1/challenges/titles", headers=_auth(token))
    titles = res.json()["data"]["titles"]
    assert len(titles) == 1
    assert titles[0]["title"] == "챌린지 마스터"


# ── increment_challenge_upload (via videos/confirm) ──────────────────

def test_upload_increments_challenge_count(client: TestClient, db: Session) -> None:
    token = _register(client, "up@x.com", "uploader")
    challenge = _make_challenge(db, condition_value=3)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={
            "r2_key": "v1.mp4", "duration_sec": 15, "challenge_id": challenge.id,
        }, headers=_auth(token))
    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    c = res.json()["data"]["challenges"][0]
    assert c["my_upload_count"] == 1
    assert c["completed"] is False


def test_upload_completes_challenge(client: TestClient, db: Session) -> None:
    token = _register(client, "comp@x.com", "completer")
    challenge = _make_challenge(db, condition_value=2)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    for i in range(2):
        with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
            client.post("/api/v1/videos/confirm", json={
                "r2_key": f"v{i}.mp4", "duration_sec": 15, "challenge_id": challenge.id,
            }, headers=_auth(token))
    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    c = res.json()["data"]["challenges"][0]
    assert c["my_upload_count"] == 2
    assert c["completed"] is True


def test_upload_with_challenge_not_joined_fails(client: TestClient, db: Session) -> None:
    token = _register(client, "nj@x.com", "notjoined")
    challenge = _make_challenge(db)
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        res = client.post("/api/v1/videos/confirm", json={
            "r2_key": "v.mp4", "duration_sec": 15, "challenge_id": challenge.id,
        }, headers=_auth(token))
    assert res.status_code == 400
