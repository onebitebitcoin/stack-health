from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


def _reg(client: TestClient, email: str = "c@x.com", username: str = "cuser") -> tuple[str, dict]:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "password123"})
    data = res.json()["data"]
    return data["access_token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_post(client: TestClient, token: str, user_id: int) -> int:
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        res = client.post("/api/v1/videos/confirm", json={"r2_key": f"videos/{user_id}/v.mp4", "duration_sec": 20}, headers=_auth(token))
    return res.json()["data"]["post"]["id"]


def test_list_comments_empty(client: TestClient) -> None:
    token, user = _reg(client)
    post_id = _make_post(client, token, user["id"])
    res = client.get(f"/api/v1/feed/{post_id}/comments")
    assert res.status_code == 200
    assert res.json()["data"]["comments"] == []


def test_list_comments_nonexistent_post(client: TestClient) -> None:
    res = client.get("/api/v1/feed/99999/comments")
    assert res.status_code == 404


def test_create_comment_requires_auth(client: TestClient) -> None:
    token, user = _reg(client, "ca@x.com", "cusera")
    post_id = _make_post(client, token, user["id"])
    res = client.post(f"/api/v1/feed/{post_id}/comments", json={"content": "hi"})
    assert res.status_code in (401, 403)


def test_create_comment_success(client: TestClient) -> None:
    token, user = _reg(client, "cb@x.com", "cuserb")
    post_id = _make_post(client, token, user["id"])
    res = client.post(f"/api/v1/feed/{post_id}/comments", json={"content": "좋아요!"}, headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]["comment"]
    assert data["content"] == "좋아요!"
    assert data["username"] == "cuserb"


def test_create_comment_appears_in_list(client: TestClient) -> None:
    token, user = _reg(client, "cc@x.com", "cuserc")
    post_id = _make_post(client, token, user["id"])
    client.post(f"/api/v1/feed/{post_id}/comments", json={"content": "첫 댓글"}, headers=_auth(token))
    res = client.get(f"/api/v1/feed/{post_id}/comments")
    comments = res.json()["data"]["comments"]
    assert len(comments) == 1
    assert comments[0]["content"] == "첫 댓글"


def test_create_comment_too_long(client: TestClient) -> None:
    token, user = _reg(client, "cd@x.com", "cuserd")
    post_id = _make_post(client, token, user["id"])
    res = client.post(
        f"/api/v1/feed/{post_id}/comments",
        json={"content": "a" * 501},
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_create_comment_empty_content(client: TestClient) -> None:
    token, user = _reg(client, "ce@x.com", "cusere")
    post_id = _make_post(client, token, user["id"])
    res = client.post(f"/api/v1/feed/{post_id}/comments", json={"content": "   "}, headers=_auth(token))
    assert res.status_code == 422


def test_delete_comment_by_owner(client: TestClient) -> None:
    token, user = _reg(client, "cf@x.com", "caserf")
    post_id = _make_post(client, token, user["id"])
    create_res = client.post(f"/api/v1/feed/{post_id}/comments", json={"content": "delete me"}, headers=_auth(token))
    comment_id = create_res.json()["data"]["comment"]["id"]
    del_res = client.delete(f"/api/v1/feed/{post_id}/comments/{comment_id}", headers=_auth(token))
    assert del_res.status_code == 200
    comments = client.get(f"/api/v1/feed/{post_id}/comments").json()["data"]["comments"]
    assert len(comments) == 0


def test_delete_comment_by_other_user_forbidden(client: TestClient) -> None:
    token_owner, user_owner = _reg(client, "cg@x.com", "cuserg")
    token_other, _ = _reg(client, "ch@x.com", "cuserh")
    post_id = _make_post(client, token_owner, user_owner["id"])
    create_res = client.post(f"/api/v1/feed/{post_id}/comments", json={"content": "mine"}, headers=_auth(token_owner))
    comment_id = create_res.json()["data"]["comment"]["id"]
    del_res = client.delete(f"/api/v1/feed/{post_id}/comments/{comment_id}", headers=_auth(token_other))
    assert del_res.status_code == 403
