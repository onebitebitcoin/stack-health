"""게시물 글(캡션·태그·운동시간) 수정 — PATCH /videos/posts/{id} 테스트."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.post import Post
from app.models.reward import RewardPoint
from app.models.video import Video
from app.services.reward import REWARD_STATUS_FIXED, REWARD_STATUS_QUEUED
from tests.test_videos import _auth, _register


def _seed_post(db: Session, user_id: int, *, tags: list[str], reward_status: str = REWARD_STATUS_QUEUED, points: float = 1.0) -> int:
    video = Video(
        user_id=user_id, r2_key=f"videos/{user_id}/v.mp4", cdn_url="https://cdn/v.mp4",
        file_hash="h", duration_sec=15, subtitle_status="skipped",
    )
    db.add(video)
    db.flush()
    post = Post(
        video_id=video.id, user_id=user_id, caption="원본 설명",
        tags=json.dumps(tags, ensure_ascii=False), share_token=f"tok{user_id}{video.id}",
    )
    db.add(post)
    db.add(RewardPoint(user_id=user_id, points=points, reason="upload", reference_id=video.id, status=reward_status))
    db.commit()
    db.refresh(post)
    return post.id


def test_update_caption_success(client: TestClient, db: Session) -> None:
    token, uid = _register(client, "edit1@x.com", "edit1")
    post_id = _seed_post(db, uid, tags=["가벼운 활동"])
    res = client.patch(f"/api/v1/videos/posts/{post_id}", json={"caption": "수정된 설명"}, headers=_auth(token))
    assert res.status_code == 200, res.text
    assert res.json()["data"]["post"]["caption"] == "수정된 설명"


def test_update_caption_too_long(client: TestClient, db: Session) -> None:
    token, uid = _register(client, "edit2@x.com", "edit2")
    post_id = _seed_post(db, uid, tags=["가벼운 활동"])
    res = client.patch(f"/api/v1/videos/posts/{post_id}", json={"caption": "x" * 141}, headers=_auth(token))
    assert res.status_code == 400


def test_update_workout_time(client: TestClient, db: Session) -> None:
    token, uid = _register(client, "edit3@x.com", "edit3")
    post_id = _seed_post(db, uid, tags=["가벼운 활동"])
    res = client.patch(f"/api/v1/videos/posts/{post_id}", json={"workout_start": "08:30", "workout_end": "09:00"}, headers=_auth(token))
    assert res.status_code == 200, res.text
    assert res.json()["data"]["post"]["workout_start"] == "08:30"


def test_update_invalid_time_format(client: TestClient, db: Session) -> None:
    token, uid = _register(client, "edit4@x.com", "edit4")
    post_id = _seed_post(db, uid, tags=["가벼운 활동"])
    res = client.patch(f"/api/v1/videos/posts/{post_id}", json={"workout_start": "25:99"}, headers=_auth(token))
    assert res.status_code == 400


def test_update_other_user_forbidden(client: TestClient, db: Session) -> None:
    _, owner_id = _register(client, "owner@x.com", "owner")
    post_id = _seed_post(db, owner_id, tags=["가벼운 활동"])
    other_token, _ = _register(client, "other@x.com", "other")
    res = client.patch(f"/api/v1/videos/posts/{post_id}", json={"caption": "해킹"}, headers=_auth(other_token))
    assert res.status_code == 403


def test_update_not_found(client: TestClient) -> None:
    token, _ = _register(client, "edit5@x.com", "edit5")
    res = client.patch("/api/v1/videos/posts/999999", json={"caption": "x"}, headers=_auth(token))
    assert res.status_code == 404


def test_main_category_change_recalculates_queued_points(client: TestClient, db: Session) -> None:
    """queued 상태에서 메인 카테고리(가벼운→땀)를 바꾸면 포인트 재산정."""
    from app.services.reward import points_for_tags
    token, uid = _register(client, "edit6@x.com", "edit6")
    post_id = _seed_post(db, uid, tags=["가벼운 활동"], reward_status=REWARD_STATUS_QUEUED, points=points_for_tags(["가벼운 활동"]))
    res = client.patch(f"/api/v1/videos/posts/{post_id}", json={"tags": ["땀 흘리는 운동", "런닝"]}, headers=_auth(token))
    assert res.status_code == 200, res.text
    post = db.query(Post).filter(Post.id == post_id).first()
    rp = db.query(RewardPoint).filter(RewardPoint.reference_id == post.video_id).first()
    db.refresh(rp)
    assert rp.points == points_for_tags(["땀 흘리는 운동", "런닝"])


def test_main_category_change_rejected_when_fixed(client: TestClient, db: Session) -> None:
    """fixed 상태면 메인 카테고리 변경 거부."""
    token, uid = _register(client, "edit7@x.com", "edit7")
    post_id = _seed_post(db, uid, tags=["가벼운 활동"], reward_status=REWARD_STATUS_FIXED)
    res = client.patch(f"/api/v1/videos/posts/{post_id}", json={"tags": ["땀 흘리는 운동"]}, headers=_auth(token))
    assert res.status_code == 400


def test_subcategory_change_allowed_when_fixed(client: TestClient, db: Session) -> None:
    """fixed여도 메인은 그대로 두고 서브태그만 바꾸면 허용."""
    token, uid = _register(client, "edit8@x.com", "edit8")
    post_id = _seed_post(db, uid, tags=["가벼운 활동", "산책"], reward_status=REWARD_STATUS_FIXED)
    res = client.patch(f"/api/v1/videos/posts/{post_id}", json={"tags": ["가벼운 활동", "계단 오르기"]}, headers=_auth(token))
    assert res.status_code == 200, res.text
    assert res.json()["data"]["post"]["tags"] == ["가벼운 활동", "계단 오르기"]


def test_unauthenticated(client: TestClient, db: Session) -> None:
    _, uid = _register(client, "edit9@x.com", "edit9")
    post_id = _seed_post(db, uid, tags=["가벼운 활동"])
    res = client.patch(f"/api/v1/videos/posts/{post_id}", json={"caption": "x"})
    assert res.status_code in (401, 403)
