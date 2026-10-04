from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class HarvestRound(Base):
    """오렌지 스토리 지급 회차. 회차마다 total_oranges(기본 1,008)개를 배분한다."""

    __tablename__ = "harvest_rounds"
    __table_args__ = (UniqueConstraint("start_date", "end_date", name="uq_harvest_round_range"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_oranges: Mapped[int] = mapped_column(Integer, nullable=False, default=1008)
    # 추첨 재현용 시드. 같은 시드면 같은 배분이 나온다.
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    # 'open' | 'paid'. paid 는 오렌지 배분이 확정됐다는 뜻이다(BTC 송금과 무관).
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 관리자가 BTC 를 보냈다고 표시한 시각
    btc_paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    allocations: Mapped[list["HarvestAllocation"]] = relationship(
        "HarvestAllocation", back_populates="round", cascade="all, delete-orphan", passive_deletes=True
    )


class HarvestAllocation(Base):
    """회차별 사용자 배분 결과. 오렌지 개수만 저장한다(sats는 저장하지 않는다)."""

    __tablename__ = "harvest_allocations"
    __table_args__ = (UniqueConstraint("round_id", "user_id", name="uq_harvest_allocation_round_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    round_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("harvest_rounds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploads: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comments: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    oranges: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 사용자가 수확한 시각. NULL 이면 다 익었지만 아직 수확하지 않은 상태("ripe")
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    round: Mapped["HarvestRound"] = relationship("HarvestRound", back_populates="allocations")


class HarvestSetting(Base):
    """수확 설정(한 행). collect_enabled 가 켜지면 사용자가 직접 수확 버튼을 눌러야 한다."""

    __tablename__ = "harvest_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    collect_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
