from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.reward import RewardPoint
from app.models.video import Video

POINTS_PER_UPLOAD = 0.5
POINTS_PER_COMMENT = 0.01
DAILY_MAX_UPLOADS = 3
SATS_PER_POINT = 10  # TBD
REWARD_STATUS_QUEUED = "queued"
REWARD_STATUS_FIXED = "fixed"
REWARD_STATUS_REVOKED = "revoked"
UTC = ZoneInfo("UTC")
KST = ZoneInfo("Asia/Seoul")


def _parse_tz(tz_str: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_str)
    except (ZoneInfoNotFoundError, Exception):
        return UTC


def get_week_range(tz: ZoneInfo = UTC) -> tuple[datetime, datetime]:
    """Return (week_start_utc, week_end_utc) for the current ISO week.

    Reward settlement, limits, and leaderboards use the global UTC calendar.
    Pass a client timezone only for presentation-only calendar views.
    """
    now_client = datetime.now(tz)
    iso = now_client.isocalendar()
    monday = datetime.fromisocalendar(iso.year, iso.week, 1)
    monday_client = monday.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=tz)
    next_monday_client = monday_client + timedelta(weeks=1)
    week_start_utc = monday_client.astimezone(timezone.utc)
    week_end_utc = next_monday_client.astimezone(timezone.utc)
    return week_start_utc, week_end_utc


def get_month_range(tz: ZoneInfo = UTC) -> tuple[datetime, datetime]:
    """Return (month_start_utc, month_end_utc) for the current calendar month.

    Reward settlement, limits, and leaderboards use the global UTC calendar.
    Pass a client timezone only for presentation-only calendar views.
    """
    now_client = datetime.now(tz)
    month_start_client = now_client.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now_client.month == 12:
        next_month_client = month_start_client.replace(year=now_client.year + 1, month=1)
    else:
        next_month_client = month_start_client.replace(month=now_client.month + 1)
    return month_start_client.astimezone(timezone.utc), next_month_client.astimezone(timezone.utc)


def points_to_sats(points: float) -> int:
    return int(points * SATS_PER_POINT)


def get_weekly_points(db: Session, user_id: int, tz: ZoneInfo = UTC) -> float:
    week_start_utc, week_end_utc = get_week_range(tz)
    result = (
        db.query(func.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == user_id,
            RewardPoint.created_at >= week_start_utc,
            RewardPoint.created_at < week_end_utc,
            RewardPoint.status == REWARD_STATUS_FIXED,
        )
        .scalar()
    )
    return result or 0


def get_weekly_queued_points(db: Session, user_id: int) -> float:
    result = (
        db.query(func.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == user_id,
            RewardPoint.status == REWARD_STATUS_QUEUED,
        )
        .scalar()
    )
    return result or 0


def _utc_today_start() -> datetime:
    """UTC midnight. Kept for non-reward daily dedupe paths such as view counting."""
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def get_daily_upload_window() -> tuple[datetime, datetime]:
    """Return today's global UTC upload-limit window."""
    today_start = _utc_today_start()
    return today_start, today_start + timedelta(days=1)


def get_daily_upload_count(db: Session, user_id: int) -> int:
    """Return today's upload count using the global UTC reset window."""
    today_start, today_end = get_daily_upload_window()
    return (
        db.query(Video)
        .filter(
            Video.user_id == user_id,
            Video.status == "active",
            Video.created_at >= today_start,
            Video.created_at < today_end,
        )
        .count()
    )



def settle_queued_rewards(db: Session, user_id: int | None = None) -> int:
    """Move upload rewards from queued to fixed after 24 hours from creation.

    Timezone-agnostic: uses UTC upload timestamp as the sole reference.
    Deleting a video before the 24h window revokes its points; after that they are kept.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    query = db.query(RewardPoint).filter(
        RewardPoint.status == REWARD_STATUS_QUEUED,
        RewardPoint.created_at <= cutoff,
    )
    if user_id is not None:
        query = query.filter(RewardPoint.user_id == user_id)

    rewards = query.all()
    for reward in rewards:
        reward.status = REWARD_STATUS_FIXED
    if rewards:
        db.flush()
    return len(rewards)


def revoke_queued_upload_reward(db: Session, video_id: int) -> int:
    """Retrieve queued upload points when the associated content is removed before settlement."""
    rewards = (
        db.query(RewardPoint)
        .filter(
            RewardPoint.reason == "upload",
            RewardPoint.reference_id == video_id,
            RewardPoint.status == REWARD_STATUS_QUEUED,
        )
        .all()
    )
    for reward in rewards:
        db.delete(reward)
    if rewards:
        db.flush()
    return len(rewards)


def add_points(
    db: Session,
    user_id: int,
    points: float,
    reason: str,
    reference_id: int | None = None,
) -> RewardPoint:
    rp = RewardPoint(
        user_id=user_id,
        points=points,
        reason=reason,
        reference_id=reference_id,
        status=REWARD_STATUS_QUEUED if reason == "upload" else REWARD_STATUS_FIXED,
    )
    db.add(rp)
    db.flush()
    return rp
