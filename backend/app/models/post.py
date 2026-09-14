from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    video_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("videos.id"), unique=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # 길이 상한은 DB가 아니라 애플리케이션(schemas.video.CAPTION_MAX_LEN)에서 강제한다.
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array string
    workout_start: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "HH:MM"
    workout_end: Mapped[str | None] = mapped_column(String(5), nullable=True)    # "HH:MM"
    proof_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String, nullable=True)
    challenge_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("challenges.id"), nullable=True, index=True)
    share_token: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    # 공개 범위: "public"(피드·타인 프로필·공유 링크에 노출) | "private"(작성자 본인만).
    # 값 검증은 DB CHECK 가 아니라 schemas.video.PostVisibility(Literal)와 라우트에서 한다
    # — videos.status / videos.subtitle_status 와 같은 방식이다.
    # 비공개여도 내 기록(캘린더·오렌지 나무·통계)과 챌린지 개설자의 검증 화면에서는 빠지지 않는다.
    visibility: Mapped[str] = mapped_column(
        String(10), default="public", server_default="public", nullable=False
    )
    # 공개된 시각. 피드와 공개 프로필의 정렬 기준이다 — 업로드 시각(created_at)이 아니다.
    # 비공개로 올려 둔 게시물을 나중에 공개하면 그 순간이 기록되어 새 글처럼 피드 위로 온다.
    # NULL 은 "아직 한 번도 공개된 적 없음". 다만 구 버전 코드가 이 컬럼 없이 INSERT 한
    # 공개 게시물도 NULL 이 되므로, 정렬 시 COALESCE 로 created_at 을 대신 쓴다.
    # 값은 처음 공개되는 순간 한 번만 적고 이후에는 바꾸지 않는다. 그래서 공개·비공개를
    # 반복해도 같은 글로 피드 상단을 다시 차지하지 못한다.
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    # 게시물 생성 시점의 BTC/KRW 가격(원 단위, 소수점 불필요). 조회 실패 시 NULL — 백필하지 않는다.
    btc_price_krw: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="posts")  # noqa: F821
    video: Mapped["Video"] = relationship("Video", back_populates="post")  # noqa: F821
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="post")  # noqa: F821
