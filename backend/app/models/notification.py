from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # 수신자 (내 게시물에 댓글/좋아요를 받은 사람)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # 행위자 (댓글/좋아요를 한 사람)
    actor_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    # "comment" | "like" | "follow"
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    # follow 알림은 게시물이 없으므로 nullable
    post_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("posts.id"), nullable=True)
    # 댓글 알림만 사용, 좋아요 알림은 NULL
    comment_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("comments.id"), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        # 수신자별 미읽음 최신순 조회 + unread-count 카운트 최적화
        Index("ix_notifications_user_read_created", "user_id", "is_read", "created_at"),
    )
