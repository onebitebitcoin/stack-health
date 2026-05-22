from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
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
