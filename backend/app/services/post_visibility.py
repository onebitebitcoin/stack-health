"""게시물 공개 범위 판정.

라우트마다 같은 조건을 다시 적지 않도록 한곳에 모았다. 실제 필터링은 각 라우트가
직접 수행하고(목록 쿼리는 SQL 필터, 단건 조회는 `is_visible_to`), 이 모듈은 판정 기준과
허용 값만 제공한다.
"""
from __future__ import annotations

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
