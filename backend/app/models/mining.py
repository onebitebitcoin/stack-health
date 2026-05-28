from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MiningRound(Base):
    __tablename__ = "mining_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    week_label: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    total_pool_sats: Mapped[int] = mapped_column(Integer, default=0)
    sats_per_block: Mapped[int] = mapped_column(Integer, default=1000)
    total_blocks: Mapped[int] = mapped_column(Integer, default=0)
    participant_count: Mapped[int] = mapped_column(Integer, default=0)
    winner_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="open")  # open | distributed | closed
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    distributed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
