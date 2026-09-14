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
    created_at: datetime | None = None,
    published_at: datetime | None = None,
    set_published: bool = True,
) -> Post:
    """테스트용 게시물 생성.

    set_published=False 는 공개 게시물인데 published_at 이 비어 있는 상태, 즉 배포 창에서
    구 슬롯 코드가 만든 행을 흉내 내는 용도다.
    """
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
    if published_at is None and set_published and visibility == "public":
        published_at = created_at or datetime.now(timezone.utc)
    post = Post(
        video_id=video.id,
        user_id=user_id,
        caption=f"{visibility} 게시물",
        tags=json.dumps(["비트코인"], ensure_ascii=False),
        share_token=token or f"tok{user_id}{video.id}",
        visibility=visibility,
        challenge_id=challenge_id,
        published_at=published_at,
    )
    if created_at is not None:
        post.created_at = created_at
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


# ---------------------------------------------------------------------------
# 정렬 — 피드는 업로드 시각이 아니라 공개된 시각 순이다
# ---------------------------------------------------------------------------


def _feed_ids(client: TestClient, token: str, *, limit: int = 20) -> list[int]:
    res = client.get("/api/v1/feed", params={"limit": limit}, headers=_auth(token))
    assert res.status_code == 200, res.text
    return [p["id"] for p in res.json()["data"]["posts"]]


def test_feed_orders_by_publish_time_not_upload_time(client: TestClient, db: Session) -> None:
    """먼저 올렸지만 나중에 공개한 게시물이, 나중에 올려 바로 공개한 게시물보다 위에 온다."""
    token, uid = _register(client, "ord-basic@x.com", "ordbasic")
    now = datetime.now(timezone.utc)

    # 5일 전에 비공개로 올려 두었다가 방금 공개한 게시물. 먼저 만들어서 id 가 더 작다.
    reopened = _seed_post(
        db, uid, visibility="public", token="tokordA",
        created_at=now - timedelta(days=5), published_at=now,
    )
    # 3일 전에 올려서 그때 바로 공개한 게시물. 나중에 만들어서 id 가 더 크다.
    older = _seed_post(
        db, uid, visibility="public", token="tokordB",
        created_at=now - timedelta(days=3), published_at=now - timedelta(days=3),
    )
    # id 순(예전 정렬)이었다면 [older, reopened] 가 나왔을 배치다.
    assert reopened.id < older.id
    assert _feed_ids(client, token) == [reopened.id, older.id]


def test_private_to_public_moves_to_top_of_feed(client: TestClient, db: Session) -> None:
    """비공개로 올려 둔 게시물을 공개로 바꾸면 피드 맨 위에 놓인다."""
    token, uid = _register(client, "ord-open@x.com", "ordopen")
    now = datetime.now(timezone.utc)

    # 비공개 쪽을 먼저 만들어 id 를 더 작게 둔다 — id 순이었다면 아래에 깔렸을 배치다.
    hidden = _seed_post(
        db, uid, visibility="private", token="tokopenA",
        created_at=now - timedelta(days=7),
    )
    published = _seed_post(
        db, uid, visibility="public", token="tokopenB",
        created_at=now - timedelta(days=1), published_at=now - timedelta(days=1),
    )
    assert hidden.id < published.id
    assert hidden.published_at is None
    assert _feed_ids(client, token) == [published.id]

    res = client.patch(
        f"/api/v1/videos/posts/{hidden.id}", json={"visibility": "public"}, headers=_auth(token)
    )
    assert res.status_code == 200, res.text
    assert _feed_ids(client, token) == [hidden.id, published.id]


def test_republish_keeps_first_publish_time(client: TestClient, db: Session) -> None:
    """공개 → 비공개 → 공개 를 반복해도 처음 공개한 시각이 유지되어 자리가 그대로다."""
    token, uid = _register(client, "ord-repub@x.com", "ordrepub")
    now = datetime.now(timezone.utc)

    # 최근에 공개한 쪽을 먼저 만들어 id 를 더 작게 둔다.
    new_post = _seed_post(
        db, uid, visibility="public", token="tokrepA",
        created_at=now - timedelta(days=1), published_at=now - timedelta(days=1),
    )
    old_post = _seed_post(
        db, uid, visibility="public", token="tokrepB",
        created_at=now - timedelta(days=10), published_at=now - timedelta(days=10),
    )
    assert new_post.id < old_post.id
    assert _feed_ids(client, token) == [new_post.id, old_post.id]

    first_published_at = old_post.published_at
    client.patch(f"/api/v1/videos/posts/{old_post.id}", json={"visibility": "private"}, headers=_auth(token))
    client.patch(f"/api/v1/videos/posts/{old_post.id}", json={"visibility": "public"}, headers=_auth(token))

    db.refresh(old_post)
    assert old_post.published_at == first_published_at
    # 토글을 반복해도 위로 올라오지 않는다
    assert _feed_ids(client, token) == [new_post.id, old_post.id]


def test_post_without_published_at_falls_back_to_created_at(
    client: TestClient, db: Session
) -> None:
    """published_at 이 빈 공개 게시물(구 슬롯 코드가 만든 행)은 업로드 시각으로 정렬된다."""
    token, uid = _register(client, "ord-legacy@x.com", "ordlegacy")
    now = datetime.now(timezone.utc)

    legacy = _seed_post(
        db, uid, visibility="public", token="toklegacy",
        created_at=now - timedelta(hours=1), set_published=False,
    )
    older = _seed_post(
        db, uid, visibility="public", token="toklegacyB",
        created_at=now - timedelta(days=2), published_at=now - timedelta(days=2),
    )
    assert legacy.published_at is None
    assert _feed_ids(client, token) == [legacy.id, older.id]


def test_feed_cursor_pagination_has_no_gap_or_duplicate(client: TestClient, db: Session) -> None:
    """공개 시각이 같은 게시물이 섞여 있어도 커서 페이지네이션이 겹치거나 빠뜨리지 않는다."""
    token, uid = _register(client, "ord-cursor@x.com", "ordcursor")
    now = datetime.now(timezone.utc)

    # 앞의 3개는 공개 시각이 완전히 동일하다 — id 로 갈라야 하는 경계다
    same_time = now - timedelta(days=1)
    ids: list[int] = []
    for i in range(3):
        ids.append(_seed_post(
            db, uid, visibility="public", token=f"tokcurS{i}",
            created_at=same_time, published_at=same_time,
        ).id)
    for i in range(3):
        ids.append(_seed_post(
            db, uid, visibility="public", token=f"tokcurD{i}",
            created_at=now - timedelta(days=2 + i), published_at=now - timedelta(days=2 + i),
        ).id)

    collected: list[int] = []
    cursor: int | None = None
    for _ in range(10):
        params: dict = {"limit": 2}
        if cursor is not None:
            params["cursor"] = cursor
        res = client.get("/api/v1/feed", params=params, headers=_auth(token))
        assert res.status_code == 200, res.text
        data = res.json()["data"]
        collected.extend(p["id"] for p in data["posts"])
        cursor = data["next_cursor"]
        if cursor is None:
            break

    assert len(collected) == len(set(collected)), "같은 게시물이 두 번 나왔다"
    assert sorted(collected) == sorted(ids), "빠진 게시물이 있다"
    assert collected == _feed_ids(client, token), "페이지를 나눠 받은 순서가 한 번에 받은 순서와 다르다"


def test_public_profile_orders_by_publish_time(client: TestClient, db: Session) -> None:
    """타인이 보는 공개 프로필의 영상 목록도 피드와 같은 공개 시각 순이다."""
    _owner_token, owner_id = _register(client, "ord-prof-owner@x.com", "ordprofowner")
    viewer_token, _ = _register(client, "ord-prof-viewer@x.com", "ordprofviewer")
    now = datetime.now(timezone.utc)

    older = _seed_post(
        db, owner_id, visibility="public", token="tokprofordA",
        created_at=now - timedelta(days=2), published_at=now - timedelta(days=2),
    )
    reopened = _seed_post(
        db, owner_id, visibility="public", token="tokprofordB",
        created_at=now - timedelta(days=9), published_at=now,
    )

    res = client.get(f"/api/v1/users/{owner_id}/profile", headers=_auth(viewer_token))
    assert res.status_code == 200, res.text
    assert [p["id"] for p in res.json()["data"]["posts"]] == [reopened.id, older.id]
