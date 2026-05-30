from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.claim import LightningClaim
from app.models.post import Post
from app.models.reward import RewardPoint
from app.models.video import Video

POINTS_PER_UPLOAD = 0.5
POINTS_PER_COMMENT = 0.01
DAILY_MAX_UPLOADS = 3
WORKOUT_TAGS = frozenset({"홈트", "러닝", "요가", "웨이트"})
SATS_PER_POINT = 10  # TBD
REWARD_STATUS_QUEUED = "queued"
REWARD_STATUS_FIXED = "fixed"
REWARD_STATUS_REVOKED = "revoked"

KST = timezone(timedelta(hours=9))


def _parse_tz(tz_str: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz_str)
    except (ZoneInfoNotFoundError, Exception):
        return ZoneInfo("Asia/Seoul")


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
    """KST midnight as UTC — daily limits reset at KST 00:00."""
    kst_midnight = datetime.now(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    return kst_midnight.astimezone(timezone.utc)


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


def get_daily_workout_upload_count(db: Session, user_id: int) -> int:
    """운동 태그가 포함된 오늘의 업로드 수만 카운트."""
    today_start = _utc_today_start()
    workout_filter = or_(*[Post.tags.contains(tag) for tag in WORKOUT_TAGS])
    return (
        db.query(Video)
        .join(Post, Post.video_id == Video.id)
        .filter(
            Video.user_id == user_id,
            Video.status == "active",
            Video.created_at >= today_start,
            workout_filter,
        )
        .count()
    )


def is_workout_upload(tags: list[str]) -> bool:
    return any(t in WORKOUT_TAGS for t in tags)


def settle_queued_rewards(db: Session, user_id: int | None = None) -> int:
    """Move upload rewards from queued to fixed at the end of the week they were created.

    Points earned this week stay queued until the week ends (Monday 00:00 KST).
    Deleting a video before settlement revokes its points; after settlement they are kept.
    """
    current_week_label = get_week_label(datetime.now(KST))

    query = db.query(RewardPoint).filter(
        RewardPoint.status == REWARD_STATUS_QUEUED,
        RewardPoint.week_label < current_week_label,
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
    week_label = get_week_label()
    rp = RewardPoint(
        user_id=user_id,
        week_label=week_label,
        points=points,
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
