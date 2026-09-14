"""게시물 공개 범위 판정.

라우트마다 같은 조건을 다시 적지 않도록 한곳에 모았다. 실제 필터링은 각 라우트가
직접 수행하고(목록 쿼리는 SQL 필터, 단건 조회는 `is_visible_to`), 이 모듈은 판정 기준과
허용 값, 그리고 공개 시각(`published_at`) 규칙을 제공한다.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func

from app.models.post import Post
from app.models.user import User

PUBLIC = "public"
PRIVATE = "private"

# 업로드 폼처럼 Pydantic Literal 을 거치지 않는 입력을 검증할 때 쓴다.
ALLOWED_VISIBILITIES = frozenset({PUBLIC, PRIVATE})


def is_visible_to(post: Post, viewer: User | None) -> bool:
    """`viewer` 가 이 게시물을 열람할 수 있으면 True 를 돌려준다.

    공개 게시물은 비로그인 사용자를 포함해 누구나 볼 수 있고, 비공개 게시물은 작성자
    본인과 운영자만 볼 수 있다.

    챌린지 개설자의 검증 화면(`routes/challenges.py` 의 `challenge_videos`)은 이 판정을
    쓰지 않는다. 챌린지에 제출하는 행위 자체가 개설자에게 인증을 요청한 것이므로,
    비공개 게시물이라도 개설자에게는 그대로 보여준다.
    """
    if post.visibility != PRIVATE:
        return True
    if viewer is None:
        return False
    return viewer.id == post.user_id or bool(viewer.is_admin)


def initial_published_at(visibility: str) -> datetime | None:
    """게시물을 만들 때 넣을 공개 시각.

    공개로 올리면 지금이 곧 공개된 시각이고, 비공개로 올리면 아직 공개된 적이 없으므로
    None 이다. 나중에 공개로 바꾸는 시점은 `mark_published_if_needed` 가 채운다.
    """
    return datetime.now(timezone.utc) if visibility == PUBLIC else None


def mark_published_if_needed(post: Post) -> None:
    """공개 상태인데 공개 시각이 아직 없으면 지금으로 채운다.

    이미 값이 있으면 건드리지 않는다. 공개했다가 비공개로 내렸다가 다시 공개해도 처음
    공개한 시각이 유지되므로, 전환을 반복해서 같은 글로 피드 상단을 다시 차지할 수 없다.
    비공개로 내릴 때도 값을 지우지 않는다 — 지우면 다시 공개하는 순간 새 글이 되어 같은
    구멍이 생긴다.
    """
    if post.visibility == PUBLIC and post.published_at is None:
        post.published_at = datetime.now(timezone.utc)


def publish_order_key():
    """피드·공개 프로필의 정렬 키(SQL 식).

    공개 시각이 기준이되, 값이 없는 행은 업로드 시각으로 대신한다. 값이 비는 경우는
    두 가지다. 배포 창에서 구 슬롯 코드가 이 컬럼 없이 INSERT 한 공개 게시물과, 이
    기능 이전에 만들어졌으나 백필이 닿지 않은 행이다. 둘 다 업로드 시각으로 두면
    기존 순서 그대로라 사용자에게 달라지는 것이 없다.
    """
    return func.coalesce(Post.published_at, Post.created_at)
