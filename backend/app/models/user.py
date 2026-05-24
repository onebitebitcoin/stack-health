from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    lightning_address: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    app_settings: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    videos: Mapped[list["Video"]] = relationship("Video", back_populates="user")  # noqa: F821
    posts: Mapped[list["Post"]] = relationship("Post", back_populates="user")  # noqa: F821
    reward_points: Mapped[list["RewardPoint"]] = relationship(  # noqa: F821
        "RewardPoint", back_populates="user"
    )
    claims: Mapped[list["LightningClaim"]] = relationship(  # noqa: F821
        "LightningClaim", back_populates="user"
    )
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="user")  # noqa: F821
    challenge_participations: Mapped[list["ChallengeParticipation"]] = relationship(  # noqa: F821
        "ChallengeParticipation", back_populates="user"
    )
