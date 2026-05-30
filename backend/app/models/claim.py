from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LightningClaim(Base):
    __tablename__ = "lightning_claims"
    __table_args__ = (UniqueConstraint("user_id", "challenge_id", name="uq_claim_user_challenge"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    challenge_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("challenges.id"), nullable=True)
    week_label: Mapped[str] = mapped_column(String, nullable=False)
    points_used: Mapped[float] = mapped_column(Float, nullable=False)
    satoshi_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    ln_address: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending | paid | cancelled
    payment_memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="claims")  # noqa: F821
