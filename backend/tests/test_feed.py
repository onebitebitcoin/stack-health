from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from jose import jwt

from app.config import settings
from app.services.auth import ALGORITHM


def _expired_access_token(user_id: int) -> str:
    """decode_token이 만료로 None을 반환하도록 이미 지난 exp로 서명한 토큰."""
    expire = datetime.now(timezone.utc) - timedelta(minutes=5)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "access"},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def _make_user(client: TestClient, email: str, username: str) -> tuple[str, dict]:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "password123"})
    data = res.json()["data"]
    return data["access_token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_post(client: TestClient, token: str, user_id: int, tag: str = "홈트") -> dict:
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        res = client.post("/api/v1/videos/confirm", json={
            "r2_key": f"videos/{user_id}/{tag}.mp4",
            "duration_sec": 20,
            "tags": [tag],
        }, headers=_auth(token))
    return res.json()["data"]["post"]


def test_feed_unauthenticated(client: TestClient) -> None:
    token, user = _make_user(client, "a@x.com", "usera")
    _create_post(client, token, user["id"])
    res = client.get("/api/v1/feed")
    assert res.status_code == 200
    assert len(res.json()["data"]["posts"]) == 1


def test_feed_no_header_is_anonymous_200(client: TestClient) -> None:
    """Authorization 헤더가 아예 없으면 여전히 비로그인 취급으로 200이 나온다."""
    res = client.get("/api/v1/feed")
    assert res.status_code == 200


def test_feed_expired_token_returns_401(client: TestClient) -> None:
    """다른 브라우저에서 하루 넘게 안 써서 access token이 만료된 상황을 재현한다.

    이전에는 get_optional_user가 조용히 None을 반환해 200 + is_liked=False가 나갔다.
    지금은 401을 내려 프론트의 refresh 인터셉터가 동작하게 한다.
    """
    _token, user = _make_user(client, "expired@x.com", "expireduser")
    expired = _expired_access_token(user["id"])
    res = client.get("/api/v1/feed", headers=_auth(expired))
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "E_AUTH_INVALID_TOKEN"


def test_feed_garbage_token_returns_401(client: TestClient) -> None:
    res = client.get("/api/v1/feed", headers=_auth("this-is-not-a-jwt"))
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "E_AUTH_INVALID_TOKEN"


def test_feed_valid_token_reflects_is_liked(client: TestClient) -> None:
    """유효한 토큰으로 조회하면 내가 좋아요한 게시물은 is_liked=true로 내려온다."""
    liker_token, _liker = _make_user(client, "liker3@x.com", "liker3")
    poster_token, poster = _make_user(client, "poster3@x.com", "poster3")
    post = _create_post(client, poster_token, poster["id"])

    client.post(f"/api/v1/feed/{post['id']}/like", headers=_auth(liker_token))

    res = client.get("/api/v1/feed", headers=_auth(liker_token))
    assert res.status_code == 200
    posts = res.json()["data"]["posts"]
    liked_post = next(p for p in posts if p["id"] == post["id"])
    assert liked_post["is_liked"] is True


def test_feed_pagination_cursor(client: TestClient) -> None:
    token, user = _make_user(client, "b@x.com", "userb")
    posts = []
    for i in range(3):
        with patch("app.routes.videos.r2_service.get_cdn_url", return_value=f"https://cdn/v{i}.mp4"):
            res = client.post("/api/v1/videos/confirm", json={
                "r2_key": f"videos/{user['id']}/v{i}.mp4", "duration_sec": 15,
            }, headers=_auth(token))
        posts.append(res.json()["data"]["post"])

    # Get first 2
    res = client.get("/api/v1/feed?limit=2")
    data = res.json()["data"]
    assert len(data["posts"]) == 2
    assert data["next_cursor"] is not None

    # Get rest using cursor
    res2 = client.get(f"/api/v1/feed?cursor={data['next_cursor']}&limit=2")
    data2 = res2.json()["data"]
    assert len(data2["posts"]) >= 1


def test_like_toggle(client: TestClient) -> None:
    token1, _ = _make_user(client, "liker@x.com", "liker")
    token2, user2 = _make_user(client, "poster@x.com", "poster")
    post = _create_post(client, token2, user2["id"])
    post_id = post["id"]

    # First like
    res = client.post(f"/api/v1/feed/{post_id}/like", headers=_auth(token1))
    assert res.status_code == 200
    assert res.json()["data"]["liked"] is True
    assert res.json()["data"]["like_count"] == 1

    # Second like = unlike
    res2 = client.post(f"/api/v1/feed/{post_id}/like", headers=_auth(token1))
    assert res2.json()["data"]["liked"] is False
    assert res2.json()["data"]["like_count"] == 0


def test_view_dedup_same_user_same_day(client: TestClient) -> None:
    token_viewer, _ = _make_user(client, "vw@x.com", "vw")
    token_poster, user_poster = _make_user(client, "vp@x.com", "vp")
    post = _create_post(client, token_poster, user_poster["id"])

    # 같은 날 같은 유저가 2번 조회 — dedup으로 view_count는 1만 증가
    client.post(f"/api/v1/feed/{post['id']}/view", headers=_auth(token_viewer))
    res = client.post(f"/api/v1/feed/{post['id']}/view", headers=_auth(token_viewer))
    assert res.status_code == 200

    feed_res = client.get("/api/v1/feed?limit=10")
    posts = feed_res.json()["data"]["posts"]
    found = next((p for p in posts if p["id"] == post["id"]), None)
    assert found is not None
    assert found["view_count"] == 1
