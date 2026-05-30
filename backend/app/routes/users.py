from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, func as sqlfunc, or_
from sqlalchemy.orm import Session, selectinload, joinedload

from app.database import get_db
from app.models.challenge import ChallengeParticipation
from app.models.comment import Comment
from app.models.post import Post
from app.models.reward import RewardPoint
from app.models.user import User
from app.models.video import Video
from app.routes.auth import get_current_user as get_required_user
from app.services.reward import (
    REWARD_STATUS_FIXED,
    REWARD_STATUS_QUEUED,
    _parse_tz,
    get_week_claim_deadline,
    get_week_label,
    get_weekly_points,
    get_weekly_queued_points,
    points_to_sats,
    settle_queued_rewards,
)

router = APIRouter(prefix="/api/v1/users", tags=["users"])


class PublicUserSchema(BaseModel):
    id: int
    username: str
    avatar_url: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class PublicPostSchema(BaseModel):
    id: int
    cdn_url: str
    thumbnail_url: str | None = None
    like_count: int
    view_count: int
    comment_count: int
    caption: str | None
    created_at: datetime


class TitleSchema(BaseModel):
    title: str
    challenge_title: str
    completed_at: datetime


class ActiveChallengeSchema(BaseModel):
    challenge_id: int
    title: str
    upload_count: int
    condition_value: int


@router.get("/me/stats")
def get_my_stats(
    current_user: User = Depends(get_required_user),
    db: Session = Depends(get_db),
) -> dict:
    settled_count = settle_queued_rewards(db, current_user.id)
    if settled_count:
        db.commit()

    total_posts = (
        db.query(Post)
        .join(Post.video)
        .filter(
            Post.user_id == current_user.id,
            Video.status == "active",
        )
        .count()
    )

    total_points = (
        db.query(sqlfunc.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == current_user.id,
            RewardPoint.points > 0,
            RewardPoint.status == REWARD_STATUS_FIXED,
        )
        .scalar()
        or 0
    )

    queued_points = (
        db.query(sqlfunc.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == current_user.id,
            RewardPoint.points > 0,
            RewardPoint.status == REWARD_STATUS_QUEUED,
        )
        .scalar()
        or 0
    )

    week_label = get_week_label()
    week_points = get_weekly_points(db, current_user.id, week_label)
    week_queued = get_weekly_queued_points(db, current_user.id)
    week_sats = points_to_sats(week_points)

    return {
        "data": {
            "total_posts": total_posts,
            "total_points": round(float(total_points), 2),
            "queued_points": round(float(queued_points), 2),
            "week_points": round(float(week_points), 2),
            "week_queued_points": round(float(week_queued), 2),
            "week_sats": week_sats,
        }
    }


@router.get("/me/weekly-points")
def get_my_weekly_points(
    current_user: User = Depends(get_required_user),
    db: Session = Depends(get_db),
    x_client_timezone: str = Header(default="UTC"),
) -> dict:
    client_tz = _parse_tz(x_client_timezone)
    week_label = get_week_label()
    year, week = int(week_label[:4]), int(week_label[6:])
    monday = datetime.fromisocalendar(year, week, 1).replace(tzinfo=client_tz)
    sunday = monday + timedelta(days=6)
    start_date = monday.date().isoformat()
    end_date = sunday.date().isoformat()

    records = (
        db.query(RewardPoint)
        .filter(
            RewardPoint.user_id == current_user.id,
            or_(
                and_(RewardPoint.week_label == week_label, RewardPoint.status == REWARD_STATUS_FIXED),
                RewardPoint.status == REWARD_STATUS_QUEUED,
            ),
            RewardPoint.points > 0,
        )
        .order_by(RewardPoint.created_at.desc())
        .all()
    )

    total_points = sum(r.points for r in records if r.status == REWARD_STATUS_FIXED)

    def to_client_date(dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(client_tz).date().isoformat()

    def to_utc_iso(dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()

    items = [
        {
            "date": to_client_date(r.created_at),
            "settles_at": to_utc_iso(get_week_claim_deadline(r.week_label)) if r.status == REWARD_STATUS_QUEUED else None,
            "points": round(float(r.points), 2),
            "source": r.reason,
            "post_id": r.reference_id,
            "queued": r.status == REWARD_STATUS_QUEUED,
        }
        for r in records
    ]

    return {
        "data": {
            "week_label": week_label,
            "week_number": week,
            "start_date": start_date,
            "end_date": end_date,
            "total_points": round(float(total_points), 2),
            "items": items,
        }
    }


@router.get("/me/monthly-points")
def get_my_monthly_points(
    current_user: User = Depends(get_required_user),
    db: Session = Depends(get_db),
    x_client_timezone: str = Header(default="UTC"),
) -> dict:
    client_tz = _parse_tz(x_client_timezone)
    now_client = datetime.now(client_tz)
    month_start = now_client.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now_client.month == 12:
        month_end = month_start.replace(year=now_client.year + 1, month=1)
    else:
        month_end = month_start.replace(month=now_client.month + 1)

    month_points = (
        db.query(sqlfunc.sum(RewardPoint.points))
        .filter(
            RewardPoint.user_id == current_user.id,
            RewardPoint.points > 0,
            RewardPoint.status == REWARD_STATUS_FIXED,
            RewardPoint.created_at >= month_start,
            RewardPoint.created_at < month_end,
        )
        .scalar()
        or 0
    )

    return {
        "data": {
            "month_points": round(float(month_points), 2),
        }
    }


@router.get("/leaderboard")
def get_leaderboard(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    search: str = Query(""),
    period: str = Query("week"),  # "week" | "all"
) -> dict:
    filters = [
        User.is_banned.is_(False),
        RewardPoint.points > 0,
        RewardPoint.status == REWARD_STATUS_FIXED,
    ]
    if period == "week":
        filters.append(RewardPoint.week_label == get_week_label())

    base_query = (
        db.query(
            User,
            sqlfunc.sum(RewardPoint.points).label("total_points"),
        )
        .join(RewardPoint, RewardPoint.user_id == User.id)
        .filter(*filters)
        .group_by(User.id)
    )

    if search:
        base_query = base_query.filter(User.username.ilike(f"%{search}%"))

    total: int = base_query.count()
    offset = (page - 1) * limit

    rows = (
        base_query
        .order_by(sqlfunc.sum(RewardPoint.points).desc(), User.id.asc())
        .offset(offset)
        .limit(limit + 1)
        .all()
    )

    has_next = len(rows) > limit
    rows = rows[:limit]

    return {
        "data": [
            {
                "rank": offset + idx + 1,
                "user_id": user.id,
                "username": user.username,
                "avatar_url": user.avatar_url,
                "total_points": round(float(total_points or 0), 1),
            }
            for idx, (user, total_points) in enumerate(rows)
        ],
        "total": total,
        "page": page,
        "limit": limit,
        "has_next": has_next,
        "period": period,
    }


@router.get("/{user_id}/profile")
def get_user_profile(user_id: int, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.is_banned:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    post_count = (
        db.query(Post)
        .join(Post.video)
        .filter(Post.user_id == user_id, Video.status == "active")
        .count()
    )
    posts_raw = (
        db.query(Post)
        .join(Post.video)
        .filter(Post.user_id == user_id, Video.status == "active")
        .options(selectinload(Post.video))
        .order_by(Post.created_at.desc())
        .limit(50)
        .all()
    )
    post_ids = [p.id for p in posts_raw]
    comment_counts: dict[int, int] = {}
    if post_ids:
        comment_counts = dict(
            db.query(Comment.post_id, sqlfunc.count(Comment.id))
            .filter(Comment.post_id.in_(post_ids))
            .group_by(Comment.post_id)
            .all()
        )
    posts = [
        PublicPostSchema(
            id=p.id,
            cdn_url=p.video.cdn_url,
            thumbnail_url=p.thumbnail_url,
            like_count=p.like_count,
            view_count=p.view_count,
            comment_count=comment_counts.get(p.id, 0),
            caption=p.caption,
            created_at=p.created_at,
        )
        for p in posts_raw
    ]

    participations = (
        db.query(ChallengeParticipation)
        .filter(ChallengeParticipation.user_id == user_id)
        .options(joinedload(ChallengeParticipation.challenge))
        .all()
    )

    titles = [
        TitleSchema(
            title=p.challenge.reward_title,
            challenge_title=p.challenge.title,
            completed_at=p.completed_at,
        )
        for p in participations
        if p.completed_at is not None
    ]

    active_challenges = [
        ActiveChallengeSchema(
            challenge_id=p.challenge_id,
            title=p.challenge.title,
            upload_count=p.upload_count,
            condition_value=p.challenge.condition_value,
        )
        for p in participations
        if p.completed_at is None and p.challenge.is_active
    ]

    return {
        "data": {
            "user": PublicUserSchema.model_validate(user),
            "post_count": post_count,
            "posts": posts,
            "titles": titles,
            "active_challenges": active_challenges,
        }
    }
