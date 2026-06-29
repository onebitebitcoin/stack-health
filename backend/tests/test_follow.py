"""팔로우 기능 (MVP) 테스트."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.notification import Notification
from tests.test_videos import _auth, _register


def test_follow_and_unfollow(client: TestClient) -> None:
    a_token, _ = _register(client, "fa@x.com", "fauser")
    _, b_id = _register(client, "fb@x.com", "fbuser")

    res = client.post(f"/api/v1/users/{b_id}/follow", headers=_auth(a_token))
    assert res.status_code == 200, res.text
    assert res.json()["data"]["is_following"] is True
    assert res.json()["data"]["follower_count"] == 1

    res = client.delete(f"/api/v1/users/{b_id}/follow", headers=_auth(a_token))
    assert res.status_code == 200
    assert res.json()["data"]["is_following"] is False
    assert res.json()["data"]["follower_count"] == 0


def test_follow_self_rejected(client: TestClient) -> None:
    token, uid = _register(client, "self@x.com", "selfuser")
    res = client.post(f"/api/v1/users/{uid}/follow", headers=_auth(token))
    assert res.status_code == 400


def test_follow_idempotent(client: TestClient) -> None:
    a_token, _ = _register(client, "idem_a@x.com", "idema")
    _, b_id = _register(client, "idem_b@x.com", "idemb")
    client.post(f"/api/v1/users/{b_id}/follow", headers=_auth(a_token))
    res = client.post(f"/api/v1/users/{b_id}/follow", headers=_auth(a_token))
    assert res.status_code == 200
    assert res.json()["data"]["follower_count"] == 1  # 중복 생성 안 됨


def test_follow_nonexistent_user(client: TestClient) -> None:
    token, _ = _register(client, "ne@x.com", "neuser")
    res = client.post("/api/v1/users/999999/follow", headers=_auth(token))
    assert res.status_code == 404


def test_follow_creates_notification(client: TestClient, db: Session) -> None:
    a_token, a_id = _register(client, "na@x.com", "nauser")
    _, b_id = _register(client, "nb@x.com", "nbuser")
    client.post(f"/api/v1/users/{b_id}/follow", headers=_auth(a_token))
    notif = db.query(Notification).filter(Notification.user_id == b_id, Notification.type == "follow").first()
    assert notif is not None
    assert notif.actor_id == a_id
    assert notif.post_id is None


def test_profile_shows_follow_counts_and_state(client: TestClient) -> None:
    a_token, a_id = _register(client, "pa@x.com", "pauser")
    b_token, b_id = _register(client, "pb@x.com", "pbuser")
    client.post(f"/api/v1/users/{b_id}/follow", headers=_auth(a_token))

    # A가 B 프로필 조회 → is_following True, B의 follower_count 1
    res = client.get(f"/api/v1/users/{b_id}/profile", headers=_auth(a_token))
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["follower_count"] == 1
    assert data["is_following"] is True

    # B가 A 프로필 조회 → is_following False, A의 following_count 1
    res = client.get(f"/api/v1/users/{a_id}/profile", headers=_auth(b_token))
    data = res.json()["data"]
    assert data["following_count"] == 1
    assert data["is_following"] is False


def test_followers_and_following_lists(client: TestClient) -> None:
    a_token, a_id = _register(client, "la@x.com", "lauser")
    _, b_id = _register(client, "lb@x.com", "lbuser")
    client.post(f"/api/v1/users/{b_id}/follow", headers=_auth(a_token))

    res = client.get(f"/api/v1/users/{b_id}/followers", headers=_auth(a_token))
    assert res.status_code == 200
    followers = res.json()["data"]["users"]
    assert any(u["id"] == a_id for u in followers)

    res = client.get(f"/api/v1/users/{a_id}/following", headers=_auth(a_token))
    following = res.json()["data"]["users"]
    assert any(u["id"] == b_id and u["is_following"] is True for u in following)


def test_unfollow_idempotent(client: TestClient) -> None:
    a_token, _ = _register(client, "ua@x.com", "uauser")
    _, b_id = _register(client, "ub@x.com", "ubuser")
    res = client.delete(f"/api/v1/users/{b_id}/follow", headers=_auth(a_token))
    assert res.status_code == 200
    assert res.json()["data"]["is_following"] is False


def test_follow_unauthenticated(client: TestClient) -> None:
    _, b_id = _register(client, "auth_b@x.com", "authb")
    res = client.post(f"/api/v1/users/{b_id}/follow")
    assert res.status_code in (401, 403)
