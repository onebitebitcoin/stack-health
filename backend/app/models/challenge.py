from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reward_title: Mapped[str] = mapped_column(String(80), nullable=False)
    condition_value: Mapped[int] = mapped_column(Integer, nullable=False)  # uploads required
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    categories: Mapped[list] = mapped_column(JSON, default=list, nullable=False, server_default="[]")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    participations: Mapped[list["ChallengeParticipation"]] = relationship(
        "ChallengeParticipation", back_populates="challenge"
    )


class ChallengeParticipation(Base):
    __tablename__ = "challenge_participations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    challenge_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("challenges.id"), nullable=False
    )
    upload_count: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="challenge_participations")  # noqa: F821
    challenge: Mapped["Challenge"] = relationship("Challenge", back_populates="participations")
