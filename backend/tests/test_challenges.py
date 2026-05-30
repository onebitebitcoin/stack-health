from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.challenge import Challenge


def _register(client: TestClient, email: str, username: str) -> tuple[str, dict]:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "pw"})
    data = res.json()["data"]
    return data["access_token"], data["user"]


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


def _confirm_upload(client: TestClient, token: str, user_id: int, filename: str = "v.mp4", challenge_id: int | None = None) -> None:
    payload: dict = {"r2_key": f"videos/{user_id}/{filename}", "duration_sec": 15}
    if challenge_id is not None:
        payload["challenge_id"] = challenge_id
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json=payload, headers=_auth(token))


def _make_admin(db: Session, client: TestClient) -> str:
    from app.models.user import User
    res = client.post("/api/v1/auth/register", json={"email": "admin_test@x.com", "username": "admin_test", "password": "pw"})
    user_id = res.json()["data"]["user"]["id"]
    token = res.json()["data"]["access_token"]
    db.query(User).filter(User.id == user_id).update({"is_admin": True})
    db.commit()
    return token


def _admin_complete(client: TestClient, admin_token: str, challenge_id: int, user_id: int) -> None:
    client.patch(f"/api/v1/challenges/{challenge_id}/participants/{user_id}/complete", headers=_auth(admin_token))


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
    token, _ = _register(client, "u@x.com", "user1")
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
    token, _ = _register(client, "j@x.com", "joiner")
    challenge = _make_challenge(db)
    res = client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["data"]["joined"] is True


def test_join_challenge_not_found(client: TestClient) -> None:
    token, _ = _register(client, "j2@x.com", "joiner2")
    res = client.post("/api/v1/challenges/999/join", headers=_auth(token))
    assert res.status_code == 404


def test_join_challenge_inactive(client: TestClient, db: Session) -> None:
    token, _ = _register(client, "j3@x.com", "joiner3")
    challenge = _make_challenge(db, is_active=False)
    res = client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    assert res.status_code == 400


def test_join_challenge_duplicate(client: TestClient, db: Session) -> None:
    token, _ = _register(client, "j4@x.com", "joiner4")
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
    token, _ = _register(client, "m@x.com", "myuser")
    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["data"]["challenges"] == []


def test_my_challenges_shows_joined(client: TestClient, db: Session) -> None:
    token, _ = _register(client, "m2@x.com", "myuser2")
    challenge = _make_challenge(db)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    data = res.json()["data"]["challenges"]
    assert len(data) == 1
    assert data[0]["title"] == challenge.title


# ── my_titles ────────────────────────────────────────────────────────

def test_my_titles_empty(client: TestClient) -> None:
    token, _ = _register(client, "t@x.com", "titleuser")
    res = client.get("/api/v1/challenges/titles", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["data"]["titles"] == []


def test_my_titles_after_completion(client: TestClient, db: Session) -> None:
    token, user = _register(client, "t2@x.com", "titleuser2")
    admin_token = _make_admin(db, client)
    challenge = _make_challenge(db, condition_value=1)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    _confirm_upload(client, token, user["id"], challenge_id=challenge.id)
    _admin_complete(client, admin_token, challenge.id, user["id"])
    res = client.get("/api/v1/challenges/titles", headers=_auth(token))
    titles = res.json()["data"]["titles"]
    assert len(titles) == 1
    assert titles[0]["title"] == "챌린지 마스터"


# ── increment_challenge_upload (via videos/confirm) ──────────────────

def test_upload_increments_challenge_count(client: TestClient, db: Session) -> None:
    token, user = _register(client, "up@x.com", "uploader")
    challenge = _make_challenge(db, condition_value=3)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    _confirm_upload(client, token, user["id"], "v1.mp4", challenge_id=challenge.id)
    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    c = res.json()["data"]["challenges"][0]
    assert c["my_upload_count"] == 1
    assert c["completed"] is False


def test_upload_completes_challenge(client: TestClient, db: Session) -> None:
    token, user = _register(client, "comp@x.com", "completer")
    admin_token = _make_admin(db, client)
    challenge = _make_challenge(db, condition_value=2)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    for i in range(2):
        _confirm_upload(client, token, user["id"], f"v{i}.mp4", challenge_id=challenge.id)
    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    c = res.json()["data"]["challenges"][0]
    assert c["my_upload_count"] == 2
    assert c["completed"] is False  # 어드민 확정 전엔 미완료
    _admin_complete(client, admin_token, challenge.id, user["id"])
    res2 = client.get("/api/v1/challenges/my", headers=_auth(token))
    assert res2.json()["data"]["challenges"][0]["completed"] is True


def test_upload_with_challenge_not_joined_fails(client: TestClient, db: Session) -> None:
    token, user = _register(client, "nj@x.com", "notjoined")
    challenge = _make_challenge(db)
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        res = client.post("/api/v1/videos/confirm", json={
            "r2_key": f"videos/{user['id']}/v.mp4", "duration_sec": 15, "challenge_id": challenge.id,
        }, headers=_auth(token))
    assert res.status_code == 400


# ── create_challenge (API) ────────────────────────────────────────────

def test_create_challenge_authenticated(client: TestClient) -> None:
    from datetime import date
    token, _ = _register(client, "creator@x.com", "creator1")
    payload = {
        "title": "API 생성 챌린지",
        "description": "설명",
        "reward_title": "마스터",
        "condition_value": 5,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=30)),
        "categories": ["strength"],
    }
    res = client.post("/api/v1/challenges", json=payload, headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]["challenge"]
    assert data["title"] == "API 생성 챌린지"
    assert data["categories"] == ["strength"]


def test_create_challenge_unauthenticated(client: TestClient) -> None:
    from datetime import date
    payload = {
        "title": "무인증 챌린지",
        "description": "설명",
        "reward_title": "타이틀",
        "condition_value": 3,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=10)),
        "categories": [],
    }
    res = client.post("/api/v1/challenges", json=payload)
    assert res.status_code in (401, 403)


# ── list_challenges category filter ──────────────────────────────────

def test_list_challenges_category_filter(client: TestClient, db: Session) -> None:
    from datetime import date
    token, _ = _register(client, "cat@x.com", "catuser")
    # strength 카테고리 챌린지 생성
    payload = {
        "title": "근력 챌린지",
        "description": "근력 운동",
        "reward_title": "근력왕",
        "condition_value": 5,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=30)),
        "categories": ["strength"],
    }
    client.post("/api/v1/challenges", json=payload, headers=_auth(token))
    # 카테고리 없는 챌린지도 하나 추가
    _make_challenge(db, "일반 챌린지")

    res = client.get("/api/v1/challenges?category=strength")
    assert res.status_code == 200
    titles = [c["title"] for c in res.json()["data"]["challenges"]]
    assert "근력 챌린지" in titles
    assert "일반 챌린지" not in titles


# ── my_created_challenges ─────────────────────────────────────────────

def test_my_created_challenges_empty(client: TestClient) -> None:
    token, _ = _register(client, "cr_empty@x.com", "creator_empty")
    res = client.get("/api/v1/challenges/created", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["data"]["challenges"] == []


def test_my_created_challenges_shows_own(client: TestClient, db: Session) -> None:
    from datetime import date
    token, _ = _register(client, "cr_own@x.com", "creator_own")
    payload = {
        "title": "내가 만든 챌린지",
        "description": "설명",
        "reward_title": "타이틀",
        "condition_value": 3,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=14)),
        "categories": [],
    }
    client.post("/api/v1/challenges", json=payload, headers=_auth(token))
    # 다른 사람이 직접 DB에 만든 챌린지 (creator_id=None)
    _make_challenge(db, "남의 챌린지")

    res = client.get("/api/v1/challenges/created", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]["challenges"]
    assert len(data) == 1
    assert data[0]["title"] == "내가 만든 챌린지"
    assert "participant_count" in data[0]
    assert "completed_count" in data[0]


# ── challenge_participants ────────────────────────────────────────────

def test_challenge_participants_creator_can_view(client: TestClient, db: Session) -> None:
    from datetime import date
    creator_token, _ = _register(client, "cp_creator@x.com", "cp_creator")
    joiner_token, _ = _register(client, "cp_joiner@x.com", "cp_joiner")

    payload = {
        "title": "참여자 조회 챌린지",
        "description": "설명",
        "reward_title": "타이틀",
        "condition_value": 5,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=30)),
        "categories": [],
    }
    create_res = client.post("/api/v1/challenges", json=payload, headers=_auth(creator_token))
    challenge_id = create_res.json()["data"]["challenge"]["id"]

    client.post(f"/api/v1/challenges/{challenge_id}/join", headers=_auth(joiner_token))

    res = client.get(f"/api/v1/challenges/{challenge_id}/participants", headers=_auth(creator_token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert "challenge" in data
    assert len(data["participants"]) == 1
    assert data["participants"][0]["username"] == "cp_joiner"


def test_challenge_participants_non_creator_forbidden(client: TestClient, db: Session) -> None:
    from datetime import date
    creator_token, _ = _register(client, "cp_cr2@x.com", "cp_creator2")
    other_token, _ = _register(client, "cp_other@x.com", "cp_other")

    payload = {
        "title": "접근 불가 챌린지",
        "description": "설명",
        "reward_title": "타이틀",
        "condition_value": 5,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=30)),
        "categories": [],
    }
    create_res = client.post("/api/v1/challenges", json=payload, headers=_auth(creator_token))
    challenge_id = create_res.json()["data"]["challenge"]["id"]

    res = client.get(f"/api/v1/challenges/{challenge_id}/participants", headers=_auth(other_token))
    assert res.status_code == 403


def test_challenge_participants_not_found(client: TestClient) -> None:
    token, _ = _register(client, "cp_nf@x.com", "cp_notfound")
    res = client.get("/api/v1/challenges/99999/participants", headers=_auth(token))
    assert res.status_code == 404


def test_delete_post_decrements_challenge_count(client: TestClient, db: Session) -> None:
    token, user = _register(client, "del_ch@x.com", "del_ch_user")
    challenge = _make_challenge(db, condition_value=3)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    _confirm_upload(client, token, user["id"], "v1.mp4", challenge_id=challenge.id)
    _confirm_upload(client, token, user["id"], "v2.mp4", challenge_id=challenge.id)

    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    assert res.json()["data"]["challenges"][0]["my_upload_count"] == 2

    # get post_id for first upload
    feed_res = client.get("/api/v1/feed?limit=10")
    posts = [p for p in feed_res.json()["data"]["posts"] if p["user_id"] == user["id"]]
    post_id = posts[0]["id"]

    with patch("app.routes.videos.r2_service.delete_object"):
        client.delete(f"/api/v1/videos/posts/{post_id}", headers=_auth(token))

    res2 = client.get("/api/v1/challenges/my", headers=_auth(token))
    assert res2.json()["data"]["challenges"][0]["my_upload_count"] == 1


def test_delete_post_clears_completed_at_if_below_threshold(client: TestClient, db: Session) -> None:
    token, user = _register(client, "del_comp@x.com", "del_comp_user")
    admin_token = _make_admin(db, client)
    challenge = _make_challenge(db, condition_value=2)
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=_auth(token))
    _confirm_upload(client, token, user["id"], "c1.mp4", challenge_id=challenge.id)
    _confirm_upload(client, token, user["id"], "c2.mp4", challenge_id=challenge.id)
    _admin_complete(client, admin_token, challenge.id, user["id"])

    res = client.get("/api/v1/challenges/my", headers=_auth(token))
    assert res.json()["data"]["challenges"][0]["completed"] is True

    feed_res = client.get("/api/v1/feed?limit=10")
    posts = [p for p in feed_res.json()["data"]["posts"] if p["user_id"] == user["id"]]
    post_id = posts[0]["id"]

    with patch("app.routes.videos.r2_service.delete_object"):
        client.delete(f"/api/v1/videos/posts/{post_id}", headers=_auth(token))

    res2 = client.get("/api/v1/challenges/my", headers=_auth(token))
    assert res2.json()["data"]["challenges"][0]["completed"] is False
    assert res2.json()["data"]["challenges"][0]["my_upload_count"] == 1
