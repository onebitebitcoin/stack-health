from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.claim import LightningClaim
from app.models.reward import RewardPoint
from app.models.video import Video

POINTS_PER_UPLOAD = 0.5
POINTS_PER_COMMENT = 0.1
DAILY_MAX_POINTS = 5.0
DAILY_MAX_UPLOADS = 3
SATS_PER_POINT = 10  # 1pt = 10 sats
MIN_CLAIM_SATS = 1000
REWARD_STATUS_QUEUED = "queued"
REWARD_STATUS_FIXED = "fixed"
REWARD_STATUS_REVOKED = "revoked"
REWARD_SETTLEMENT_DELAY = timedelta(days=1)

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


def points_to_sats(points: float) -> int:
    return int(points * SATS_PER_POINT)


def get_weekly_points(db: Session, user_id: int, week_label: str) -> float:
    result = (
        db.query(func.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == user_id,
            RewardPoint.week_label == week_label,
            RewardPoint.status == REWARD_STATUS_FIXED,
        )
        .scalar()
    )
    return result or 0


def get_weekly_queued_points(db: Session, user_id: int, week_label: str) -> float:
    result = (
        db.query(func.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == user_id,
            RewardPoint.week_label == week_label,
            RewardPoint.status == REWARD_STATUS_QUEUED,
        )
        .scalar()
    )
    return result or 0


def _utc_today_start() -> datetime:
    """KST midnight expressed as naive UTC — daily limits reset at KST 00:00."""
    kst_midnight = datetime.now(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    return kst_midnight.astimezone(timezone.utc).replace(tzinfo=None)


def get_daily_upload_count(db: Session, user_id: int) -> int:
    today_start = _utc_today_start()
    return (
        db.query(Video)
        .filter(
            Video.user_id == user_id,
            Video.status == "active",
            Video.created_at >= today_start,
        )
        .count()
    )


def get_daily_total_points(db: Session, user_id: int) -> float:
    today_start = _utc_today_start()
    result = (
        db.query(func.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == user_id,
            RewardPoint.created_at >= today_start,
            RewardPoint.status != REWARD_STATUS_REVOKED,
        )
        .scalar()
    )
    return result or 0


def settle_queued_rewards(db: Session, user_id: int | None = None, now: datetime | None = None) -> int:
    """Move upload rewards from queued to fixed once content survived 24 hours."""
    settled_at = now or datetime.now(timezone.utc)
    if settled_at.tzinfo is None:
        settled_at_utc = settled_at.replace(tzinfo=timezone.utc)
    else:
        settled_at_utc = settled_at.astimezone(timezone.utc)
    cutoff = settled_at_utc.replace(tzinfo=None) - REWARD_SETTLEMENT_DELAY
    settlement_week_label = get_week_label(settled_at_utc.astimezone(KST))

    query = db.query(RewardPoint).filter(
        RewardPoint.status == REWARD_STATUS_QUEUED,
        RewardPoint.created_at <= cutoff,
    )
    if user_id is not None:
        query = query.filter(RewardPoint.user_id == user_id)

    rewards = query.all()
    for reward in rewards:
        reward.status = REWARD_STATUS_FIXED
        reward.week_label = settlement_week_label
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
        reward.status = REWARD_STATUS_REVOKED
    if rewards:
        db.flush()
    return len(rewards)


def add_points(
    db: Session,
    user_id: int,
    points: float,
    reason: str,
    reference_id: int | None = None,
    early_adopter_bonus: bool = False,
) -> RewardPoint | None:
    """Add points respecting daily cap. Returns None if daily cap reached."""
    current_daily = get_daily_total_points(db, user_id)
    if current_daily >= DAILY_MAX_POINTS:
        return None

    base_points = points * 2 if early_adopter_bonus else points
    # Cap at daily max
    actual_points = min(base_points, DAILY_MAX_POINTS - current_daily)
    week_label = get_week_label()

    rp = RewardPoint(
        user_id=user_id,
        week_label=week_label,
        points=actual_points,
        reason=reason,
        reference_id=reference_id,
        status=REWARD_STATUS_QUEUED if reason == "upload" else REWARD_STATUS_FIXED,
    )
    db.add(rp)
    db.flush()
    return rp


def get_total_weekly_points_all_users(db: Session, week_label: str) -> float:
    result = (
        db.query(func.sum(RewardPoint.points))
        .filter(
            RewardPoint.week_label == week_label,
            RewardPoint.status == REWARD_STATUS_FIXED,
        )
        .scalar()
    )
    return result or 0


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
