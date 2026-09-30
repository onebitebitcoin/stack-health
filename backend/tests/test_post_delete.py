"""게시물 삭제 테스트.

게시물·영상 행은 요청 안에서 지우고, R2 객체 삭제는 응답 뒤 백그라운드로 미룬다.
R2 삭제가 실패해도 삭제 요청 자체는 성공해야 한다.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.post import Post
from app.models.video import Video
from app.services import r2 as r2_service
from tests.test_post_visibility import _seed_post
from tests.test_videos import _auth, _register


def test_delete_post_removes_rows_and_r2_object(client: TestClient, db: Session, monkeypatch):
    token, user_id = _register(client)
    post = _seed_post(db, user_id)
    post_id, video_id = post.id, post.video_id
    deleted_keys: list[str] = []
    monkeypatch.setattr(r2_service, "delete_object", deleted_keys.append)

    res = client.delete(f"/api/v1/videos/posts/{post_id}", headers=_auth(token))

    assert res.status_code == 200
    assert res.json()["data"]["deleted"] == post_id
    db.expire_all()
    assert db.get(Post, post_id) is None
    assert db.get(Video, video_id) is None
    assert deleted_keys == [f"videos/{user_id}/public.mp4"]


def test_delete_post_succeeds_even_if_r2_delete_fails(client: TestClient, db: Session, monkeypatch):
    token, user_id = _register(client)
    post = _seed_post(db, user_id)
    post_id = post.id

    def _fail(_key: str) -> None:
        raise RuntimeError("R2 down")

    monkeypatch.setattr(r2_service, "delete_object", _fail)

    res = client.delete(f"/api/v1/videos/posts/{post_id}", headers=_auth(token))

    assert res.status_code == 200
    db.expire_all()
    assert db.get(Post, post_id) is None


def test_delete_post_forbidden_for_other_user(client: TestClient, db: Session):
    _, owner_id = _register(client)
    other_token, _ = _register(client, email="o@x.com", username="other")
    post = _seed_post(db, owner_id)

    res = client.delete(f"/api/v1/videos/posts/{post.id}", headers=_auth(other_token))

    assert res.status_code == 403
