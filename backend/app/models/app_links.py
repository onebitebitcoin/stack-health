from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AppLinks(Base):
    __tablename__ = "app_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    android_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    ios_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    android_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ios_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
