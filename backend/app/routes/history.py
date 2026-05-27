from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.post import Post
from app.models.video import Video
from app.models.user import User
from app.routes.auth import get_current_user as get_required_user

KST = timezone(timedelta(hours=9))

router = APIRouter(prefix="/api/v1/history", tags=["history"])


def _to_kst_date(dt: datetime) -> str:
    """Convert naive UTC datetime to KST date string YYYY-MM-DD."""
    utc_dt = dt.replace(tzinfo=timezone.utc)
    kst_dt = utc_dt.astimezone(KST)
    return kst_dt.strftime("%Y-%m-%d")


def _compute_streak(workout_dates: set[str], today_kst: str) -> int:
    """Count consecutive days ending at today or yesterday (KST).
    If today has no workout yet, start from yesterday so the streak
    doesn't drop to 0 just because the day hasn't been completed yet.
    """
    today = datetime.strptime(today_kst, "%Y-%m-%d").date()
    start = today if today_kst in workout_dates else today - timedelta(days=1)
    streak = 0
    current = start
    while True:
        date_str = current.strftime("%Y-%m-%d")
        if date_str not in workout_dates:
            break
        streak += 1
        current -= timedelta(days=1)
    return streak


@router.get("")
def get_history(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_required_user),
) -> dict:
    now_kst = datetime.now(KST)

    if year is None:
        year = now_kst.year
    if month is None:
        month = now_kst.month

    # Query all posts by this user for the given month (KST)
    # We need a window slightly wider than the month to handle UTC→KST boundary
    # Fetch from start of month-1 day to end of month+1 day in UTC and filter in Python
    from calendar import monthrange

    last_day = monthrange(year, month)[1]

    # UTC window: KST midnight of (year, month, 1) → KST end of (year, month, last_day)
    month_start_kst = datetime(year, month, 1, 0, 0, 0, tzinfo=KST)
    month_end_kst = datetime(year, month, last_day, 23, 59, 59, tzinfo=KST)

    month_start_utc = month_start_kst.astimezone(timezone.utc).replace(tzinfo=None)
    month_end_utc = month_end_kst.astimezone(timezone.utc).replace(tzinfo=None)

    posts = (
        db.query(Post)
        .join(Post.video)
        .filter(
            Post.user_id == current_user.id,
            Video.status == "active",
            Post.created_at >= month_start_utc,
            Post.created_at <= month_end_utc,
        )
        .order_by(Post.created_at.asc())
        .all()
    )

    workout_days: dict[str, list[dict]] = defaultdict(list)
    for post in posts:
        date_str = _to_kst_date(post.created_at)
        # Double-check the KST date is actually within the requested month
        pd = datetime.strptime(date_str, "%Y-%m-%d")
        if pd.year == year and pd.month == month:
            workout_days[date_str].append(
                {
                    "id": post.id,
                    "cdn_url": post.video.cdn_url,
                    "like_count": post.like_count,
                    "view_count": post.view_count,
                    "caption": post.caption,
                }
            )

    # For streak: query ALL user posts (any time) to compute streak correctly
    all_posts = (
        db.query(Post)
        .join(Post.video)
        .filter(
            Post.user_id == current_user.id,
            Video.status == "active",
        )
        .all()
    )
    all_workout_dates = {_to_kst_date(p.created_at) for p in all_posts}

    today_kst_str = now_kst.strftime("%Y-%m-%d")
    streak = _compute_streak(all_workout_dates, today_kst_str)

    return {
        "data": {
            "year": year,
            "month": month,
            "streak": streak,
            "total_days": len(workout_days),
            "workout_days": dict(workout_days),
        }
    }
