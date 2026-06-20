from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


def _reg(client: TestClient, email: str = "a@x.com", username: str = "usera") -> tuple[str, dict]:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "password123"})
    data = res.json()["data"]
    return data["access_token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_post(client: TestClient, token: str, user_id: int) -> int:
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        res = client.post(
            "/api/v1/videos/confirm",
            json={"r2_key": f"videos/{user_id}/v.mp4", "duration_sec": 20},
            headers=_auth(token),
        )
    return res.json()["data"]["post"]["id"]


def _comment(client: TestClient, token: str, post_id: int, content: str = "정말 멋진 운동이에요") -> dict:
    res = client.post(f"/api/v1/feed/{post_id}/comments", json={"content": content}, headers=_auth(token))
    assert res.status_code == 200
    return res.json()["data"]["comment"]


def _like(client: TestClient, token: str, post_id: int) -> dict:
    res = client.post(f"/api/v1/feed/{post_id}/like", headers=_auth(token))
    assert res.status_code == 200
    return res.json()["data"]


# ── 알림 생성 ─────────────────────────────────────────────────────────────────

def test_comment_creates_notification_for_post_owner(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    token_b, _ = _reg(client, "b@x.com", "userb")
    post_id = _make_post(client, token_a, user_a["id"])

    _comment(client, token_b, post_id)

    res = client.get("/api/v1/notifications", headers=_auth(token_a))
    assert res.status_code == 200
    notifs = res.json()["data"]["notifications"]
    assert len(notifs) == 1
    assert notifs[0]["type"] == "comment"
    assert notifs[0]["actor"]["username"] == "userb"
    assert notifs[0]["post_id"] == post_id
    assert notifs[0]["is_read"] is False


def test_like_creates_notification_for_post_owner(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    token_b, _ = _reg(client, "b@x.com", "userb")
    post_id = _make_post(client, token_a, user_a["id"])

    _like(client, token_b, post_id)

    res = client.get("/api/v1/notifications", headers=_auth(token_a))
    notifs = res.json()["data"]["notifications"]
    assert len(notifs) == 1
    assert notifs[0]["type"] == "like"
    assert notifs[0]["comment_id"] is None


def test_unlike_does_not_create_notification(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    token_b, _ = _reg(client, "b@x.com", "userb")
    post_id = _make_post(client, token_a, user_a["id"])

    _like(client, token_b, post_id)   # 좋아요
    _like(client, token_b, post_id)   # 취소

    res = client.get("/api/v1/notifications", headers=_auth(token_a))
    # 최초 좋아요 1건만 존재 (취소 시 추가 알림 없음)
    assert len(res.json()["data"]["notifications"]) == 1


def test_self_comment_does_not_create_notification(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    post_id = _make_post(client, token_a, user_a["id"])

    _comment(client, token_a, post_id)

    res = client.get("/api/v1/notifications", headers=_auth(token_a))
    assert res.json()["data"]["notifications"] == []


def test_self_like_does_not_create_notification(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    post_id = _make_post(client, token_a, user_a["id"])

    _like(client, token_a, post_id)

    res = client.get("/api/v1/notifications", headers=_auth(token_a))
    assert res.json()["data"]["notifications"] == []


# ── 목록 정렬 + actor 포함 ────────────────────────────────────────────────────

def test_notifications_ordered_newest_first(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    token_b, _ = _reg(client, "b@x.com", "userb")
    post_id = _make_post(client, token_a, user_a["id"])

    _comment(client, token_b, post_id, "첫 번째 댓글입니다")
    _like(client, token_b, post_id)

    res = client.get("/api/v1/notifications", headers=_auth(token_a))
    notifs = res.json()["data"]["notifications"]
    assert len(notifs) == 2
    # 최신순: like가 comment보다 나중
    assert notifs[0]["type"] == "like"
    assert notifs[1]["type"] == "comment"


# ── unread-count ──────────────────────────────────────────────────────────────

def test_unread_count(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    token_b, _ = _reg(client, "b@x.com", "userb")
    post_id = _make_post(client, token_a, user_a["id"])

    res = client.get("/api/v1/notifications/unread-count", headers=_auth(token_a))
    assert res.json()["data"]["count"] == 0

    _comment(client, token_b, post_id)
    _like(client, token_b, post_id)

    res = client.get("/api/v1/notifications/unread-count", headers=_auth(token_a))
    assert res.json()["data"]["count"] == 2


# ── 단건 읽음 ─────────────────────────────────────────────────────────────────

def test_read_one(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    token_b, _ = _reg(client, "b@x.com", "userb")
    post_id = _make_post(client, token_a, user_a["id"])
    _comment(client, token_b, post_id)

    notif_id = client.get("/api/v1/notifications", headers=_auth(token_a)).json()["data"]["notifications"][0]["id"]
    res = client.post(f"/api/v1/notifications/{notif_id}/read", headers=_auth(token_a))
    assert res.status_code == 200
    assert res.json()["data"]["read"] is True

    count = client.get("/api/v1/notifications/unread-count", headers=_auth(token_a)).json()["data"]["count"]
    assert count == 0


def test_read_one_not_owner_returns_404(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    token_b, _ = _reg(client, "b@x.com", "userb")
    post_id = _make_post(client, token_a, user_a["id"])
    _comment(client, token_b, post_id)

    notif_id = client.get("/api/v1/notifications", headers=_auth(token_a)).json()["data"]["notifications"][0]["id"]
    # B가 A의 알림을 읽으려 함 → 404
    res = client.post(f"/api/v1/notifications/{notif_id}/read", headers=_auth(token_b))
    assert res.status_code == 404


# ── 전체 읽음 ─────────────────────────────────────────────────────────────────

def test_read_all(client: TestClient) -> None:
    token_a, user_a = _reg(client, "a@x.com", "usera")
    token_b, _ = _reg(client, "b@x.com", "userb")
    post_id = _make_post(client, token_a, user_a["id"])
    _comment(client, token_b, post_id)
    _like(client, token_b, post_id)

    res = client.post("/api/v1/notifications/read-all", headers=_auth(token_a))
    assert res.status_code == 200
    assert res.json()["data"]["updated"] == 2

    count = client.get("/api/v1/notifications/unread-count", headers=_auth(token_a)).json()["data"]["count"]
    assert count == 0


# ── 인증 필수 ─────────────────────────────────────────────────────────────────

def test_list_requires_auth(client: TestClient) -> None:
    res = client.get("/api/v1/notifications")
    assert res.status_code == 401


def test_unread_count_requires_auth(client: TestClient) -> None:
    res = client.get("/api/v1/notifications/unread-count")
    assert res.status_code == 401
