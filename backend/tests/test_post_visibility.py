"""게시물 공개 범위(public/private) 테스트.

비공개 게시물은 작성자 본인과 운영자만 볼 수 있고, 피드·타인 프로필·공유 링크에서
모두 빠진다. 반면 내 기록(내 영상 목록)과 챌린지 개설자의 검증 화면에는 그대로 남는다.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.models.challenge import Challenge
from app.models.post import Post
from app.models.user import User
from app.models.video import Video
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.test_videos import _auth, _register


def _seed_post(
    db: Session,
    user_id: int,
    *,
    visibility: str = "public",
    token: str | None = None,
    challenge_id: int | None = None,
) -> Post:
    video = Video(
        user_id=user_id,
        r2_key=f"videos/{user_id}/{visibility}.mp4",
        cdn_url="https://cdn/v.mp4",
        file_hash=f"h{user_id}{visibility}",
        duration_sec=15,
        subtitle_status="skipped",
    )
    db.add(video)
    db.flush()
    post = Post(
        video_id=video.id,
        user_id=user_id,
        caption=f"{visibility} 게시물",
        tags=json.dumps(["비트코인"], ensure_ascii=False),
        share_token=token or f"tok{user_id}{video.id}",
        visibility=visibility,
        challenge_id=challenge_id,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def _make_admin(db: Session, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    assert user is not None
    user.is_admin = True
    db.commit()


# ---------------------------------------------------------------------------
# 기본값
# ---------------------------------------------------------------------------


def test_default_visibility_is_public(client: TestClient, db: Session) -> None:
    """공개 범위를 지정하지 않고 만든 게시물은 공개다 (기존 동작 유지)."""
    _token, uid = _register(client, "vis-default@x.com", "visdefault")
    video = Video(
        user_id=uid, r2_key=f"videos/{uid}/v.mp4", cdn_url="https://cdn/v.mp4",
        file_hash="hdefault", duration_sec=15, subtitle_status="skipped",
    )
    db.add(video)
    db.flush()
    post = Post(video_id=video.id, user_id=uid, share_token="tokdefault")
    db.add(post)
    db.commit()
    db.refresh(post)
    assert post.visibility == "public"


# ---------------------------------------------------------------------------
# 피드
# ---------------------------------------------------------------------------


def test_private_post_hidden_from_feed(client: TestClient, db: Session) -> None:
    token, uid = _register(client, "vis-feed@x.com", "visfeed")
    public_post = _seed_post(db, uid, visibility="public", token="tokfeedpub")
    private_post = _seed_post(db, uid, visibility="private", token="tokfeedpriv")

    res = client.get("/api/v1/feed", headers=_auth(token))
    assert res.status_code == 200, res.text
    feed_ids = [p["id"] for p in res.json()["data"]["posts"]]
    assert public_post.id in feed_ids
    assert private_post.id not in feed_ids


def test_like_and_view_on_private_post_of_other_user_returns_404(
    client: TestClient, db: Session
) -> None:
    _owner_token, owner_id = _register(client, "vis-like-owner@x.com", "vislikeowner")
    other_token, _other_id = _register(client, "vis-like-other@x.com", "vislikeother")
    private_post = _seed_post(db, owner_id, visibility="private", token="tokprivlike")

    like = client.post(f"/api/v1/feed/{private_post.id}/like", headers=_auth(other_token))
    assert like.status_code == 404
    view = client.post(f"/api/v1/feed/{private_post.id}/view", headers=_auth(other_token))
    assert view.status_code == 404


# ---------------------------------------------------------------------------
# 내 영상 목록 — 비공개도 본인에게는 보인다
# ---------------------------------------------------------------------------


def test_my_posts_includes_private_with_visibility_field(
    client: TestClient, db: Session
) -> None:
    token, uid = _register(client, "vis-mine@x.com", "vismine")
    private_post = _seed_post(db, uid, visibility="private", token="tokmine")

    res = client.get("/api/v1/videos/my-posts", params={"all": True}, headers=_auth(token))
    assert res.status_code == 200, res.text
    posts = {p["id"]: p for p in res.json()["data"]["posts"]}
    assert private_post.id in posts
    assert posts[private_post.id]["visibility"] == "private"


# ---------------------------------------------------------------------------
# 단건 조회 / 공유 링크
# ---------------------------------------------------------------------------


def test_get_private_post_owner_ok_other_404(client: TestClient, db: Session) -> None:
    owner_token, owner_id = _register(client, "vis-get-owner@x.com", "visgetowner")
    other_token, _ = _register(client, "vis-get-other@x.com", "visgetother")
    post = _seed_post(db, owner_id, visibility="private", token="tokget")

    assert client.get(f"/api/v1/videos/posts/{post.id}", headers=_auth(owner_token)).status_code == 200
    assert client.get(f"/api/v1/videos/posts/{post.id}", headers=_auth(other_token)).status_code == 404
    assert client.get(f"/api/v1/videos/posts/{post.id}").status_code == 404


def test_get_private_post_admin_ok(client: TestClient, db: Session) -> None:
    _owner_token, owner_id = _register(client, "vis-adm-owner@x.com", "visadmowner")
    admin_token, admin_id = _register(client, "vis-adm@x.com", "visadm")
    _make_admin(db, admin_id)
    post = _seed_post(db, owner_id, visibility="private", token="tokadm")

    res = client.get(f"/api/v1/videos/posts/{post.id}", headers=_auth(admin_token))
    assert res.status_code == 200, res.text


def test_share_link_blocked_while_private_and_restored_when_public(
    client: TestClient, db: Session
) -> None:
    """비공개로 바꾸면 공유 링크도 막히고, 다시 공개로 돌리면 같은 토큰으로 되살아난다."""
    owner_token, owner_id = _register(client, "vis-share@x.com", "visshare")
    post = _seed_post(db, owner_id, visibility="public", token="tokshare")
    url = f"/api/v1/videos/posts/share/{post.share_token}"

    assert client.get(url).status_code == 200

    res = client.patch(
        f"/api/v1/videos/posts/{post.id}", json={"visibility": "private"}, headers=_auth(owner_token)
    )
    assert res.status_code == 200, res.text
    assert res.json()["data"]["post"]["visibility"] == "private"

    assert client.get(url).status_code == 404
    # 작성자 본인은 자기 공유 링크를 그대로 열 수 있다.
    assert client.get(url, headers=_auth(owner_token)).status_code == 200

    client.patch(
        f"/api/v1/videos/posts/{post.id}", json={"visibility": "public"}, headers=_auth(owner_token)
    )
    assert client.get(url).status_code == 200


# ---------------------------------------------------------------------------
# 전환 권한
# ---------------------------------------------------------------------------


def test_other_user_cannot_change_visibility(client: TestClient, db: Session) -> None:
    _owner_token, owner_id = _register(client, "vis-perm-owner@x.com", "vispermowner")
    other_token, _ = _register(client, "vis-perm-other@x.com", "vispermother")
    post = _seed_post(db, owner_id, visibility="public", token="tokperm")

    res = client.patch(
        f"/api/v1/videos/posts/{post.id}", json={"visibility": "private"}, headers=_auth(other_token)
    )
    assert res.status_code == 403
    db.refresh(post)
    assert post.visibility == "public"


def test_invalid_visibility_value_rejected(client: TestClient, db: Session) -> None:
    token, uid = _register(client, "vis-bad@x.com", "visbad")
    post = _seed_post(db, uid, visibility="public", token="tokbad")

    res = client.patch(
        f"/api/v1/videos/posts/{post.id}", json={"visibility": "secret"}, headers=_auth(token)
    )
    assert res.status_code == 422


def test_visibility_untouched_when_field_omitted(client: TestClient, db: Session) -> None:
    """캡션만 고치는 요청이 공개 범위를 건드리지 않는다 (exclude_unset)."""
    token, uid = _register(client, "vis-keep@x.com", "viskeep")
    post = _seed_post(db, uid, visibility="private", token="tokkeep")

    res = client.patch(
        f"/api/v1/videos/posts/{post.id}", json={"caption": "설명만 수정"}, headers=_auth(token)
    )
    assert res.status_code == 200, res.text
    assert res.json()["data"]["post"]["visibility"] == "private"


# ---------------------------------------------------------------------------
# 공개 프로필 / 댓글
# ---------------------------------------------------------------------------


def test_public_profile_excludes_private_posts(client: TestClient, db: Session) -> None:
    _owner_token, owner_id = _register(client, "vis-prof-owner@x.com", "visprofowner")
    viewer_token, _ = _register(client, "vis-prof-viewer@x.com", "visprofviewer")
    public_post = _seed_post(db, owner_id, visibility="public", token="tokprofpub")
    private_post = _seed_post(db, owner_id, visibility="private", token="tokprofpriv")

    res = client.get(f"/api/v1/users/{owner_id}/profile", headers=_auth(viewer_token))
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    post_ids = [p["id"] for p in data["posts"]]
    assert public_post.id in post_ids
    assert private_post.id not in post_ids
    assert data["post_count"] == 1


def test_comments_on_private_post_blocked_for_others(client: TestClient, db: Session) -> None:
    _owner_token, owner_id = _register(client, "vis-cmt-owner@x.com", "viscmtowner")
    other_token, _ = _register(client, "vis-cmt-other@x.com", "viscmtother")
    post = _seed_post(db, owner_id, visibility="private", token="tokcmt")

    assert client.get(f"/api/v1/feed/{post.id}/comments", headers=_auth(other_token)).status_code == 404
    create = client.post(
        f"/api/v1/feed/{post.id}/comments", json={"content": "좋아요"}, headers=_auth(other_token)
    )
    assert create.status_code == 404


# ---------------------------------------------------------------------------
# 챌린지 — 개설자의 검증 화면에는 비공개도 보인다
# ---------------------------------------------------------------------------


def test_challenge_owner_sees_private_post(client: TestClient, db: Session) -> None:
    creator_token, creator_id = _register(client, "vis-ch-creator@x.com", "vischcreator")
    _participant_token, participant_id = _register(client, "vis-ch-part@x.com", "vischpart")
    now = datetime.now(timezone.utc)
    challenge = Challenge(
        title="비트코인 기록 챌린지",
        description="테스트",
        reward_title="기록왕",
        condition_value=3,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        is_active=True,
        creator_id=creator_id,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    private_post = _seed_post(
        db, participant_id, visibility="private", token="tokch", challenge_id=challenge.id
    )

    res = client.get(f"/api/v1/challenges/{challenge.id}/videos", headers=_auth(creator_token))
    assert res.status_code == 200, res.text
    assert private_post.id in [v["post_id"] for v in res.json()["data"]["videos"]]
