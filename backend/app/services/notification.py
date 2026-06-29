from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.notification import Notification


def create_notification(
    db: Session,
    *,
    recipient_id: int,
    actor_id: int,
    type: str,
    post_id: int | None = None,
    comment_id: int | None = None,
) -> None:
    """알림 생성 헬퍼. 자기 게시물에 자기가 행동하면 알림을 생성하지 않는다.
    commit은 호출측 라우트에서 처리한다 (동일 트랜잭션).
    """
    if recipient_id == actor_id:
        return
    db.add(
        Notification(
            user_id=recipient_id,
            actor_id=actor_id,
            type=type,
            post_id=post_id,
            comment_id=comment_id,
        )
    )
