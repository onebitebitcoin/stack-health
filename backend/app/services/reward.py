from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.claim import LightningClaim
from app.models.reward import RewardPoint

POINTS_PER_UPLOAD = 50
POINTS_PER_LIKE_RECEIVED = 5
POINTS_PER_VIEW_RECEIVED = 2
DAILY_MAX_POINTS = 300
DAILY_MAX_UPLOADS = 3
POINTS_TO_SATS_DIVISOR = 100  # 100pt = 1000 sats
SATS_PER_HUNDRED_POINTS = 1000
MIN_CLAIM_SATS = 1000

KST = timezone(timedelta(hours=9))


def get_week_label(dt: datetime | None = None) -> str:
    """Return ISO week label like '2026-W21'."""
    d = (dt or datetime.now(KST)).isocalendar()
    return f"{d.year}-W{d.week:02d}"


def get_week_claim_deadline(week_label: str) -> datetime:
    """Monday 00:00 KST of the NEXT week (= end of current week)."""
    year, week = int(week_label[:4]), int(week_label[6:])
    # Monday of the given week
    monday = datetime.fromisocalendar(year, week, 1).replace(tzinfo=KST)
    # Next Monday = claim deadline
    return monday + timedelta(weeks=1)


def points_to_sats(points: int) -> int:
    # 100pt = 1000 sats → 1pt = 10 sats (proportional, no floor per 100)
    return points * SATS_PER_HUNDRED_POINTS // POINTS_TO_SATS_DIVISOR


def get_weekly_points(db: Session, user_id: int, week_label: str) -> int:
    result = (
        db.query(func.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == user_id,
            RewardPoint.week_label == week_label,
        )
        .scalar()
    )
    return result or 0


def _utc_today_start() -> datetime:
    """Naive UTC midnight — matches how SQLite stores server_default=func.now()."""
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, now.day)


def get_daily_upload_count(db: Session, user_id: int) -> int:
    today_start = _utc_today_start()
    return (
        db.query(RewardPoint)
        .filter(
            RewardPoint.user_id == user_id,
            RewardPoint.reason == "upload",
            RewardPoint.created_at >= today_start,
        )
        .count()
    )


def get_daily_total_points(db: Session, user_id: int) -> int:
    today_start = _utc_today_start()
    result = (
        db.query(func.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == user_id,
            RewardPoint.created_at >= today_start,
        )
        .scalar()
    )
    return result or 0


def add_points(
    db: Session,
    user_id: int,
    points: int,
    reason: str,
    reference_id: int | None = None,
) -> RewardPoint | None:
    """Add points respecting daily cap. Returns None if daily cap reached."""
    current_daily = get_daily_total_points(db, user_id)
    if current_daily >= DAILY_MAX_POINTS:
        return None

    # Cap at daily max
    actual_points = min(points, DAILY_MAX_POINTS - current_daily)
    week_label = get_week_label()

    rp = RewardPoint(
        user_id=user_id,
        week_label=week_label,
        points=actual_points,
        reason=reason,
        reference_id=reference_id,
    )
    db.add(rp)
    db.flush()
    return rp


def has_claimed_this_week(db: Session, user_id: int, week_label: str) -> bool:
    return (
        db.query(LightningClaim)
        .filter(
            LightningClaim.user_id == user_id,
            LightningClaim.week_label == week_label,
            LightningClaim.status != "cancelled",
        )
        .first()
        is not None
    )
