import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.models.reward import RewardPoint
from app.models.video import Video
from app.models.user import User
from app.schemas.video import PostSchema
from app.services.auth import decode_token, get_user_by_id
from app.services.reward import (
    POINTS_PER_LIKE_RECEIVED,
    POINTS_PER_VIEW_RECEIVED,
    add_points,
    get_week_label,
)

KST = timezone(timedelta(hours=9))

router = APIRouter(prefix="/api/v1/feed", tags=["feed"])
bearer = HTTPBearer(auto_error=False)
bearer_required = HTTPBearer()


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if credentials is None:
        return None
    user_id = decode_token(credentials.credentials)
    if user_id is None:
        return None
    return get_user_by_id(db, user_id)


def get_required_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_required),
    db: Session = Depends(get_db),
) -> User:
    user_id = decode_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _post_to_schema(post: Post, db: Session, viewer_id: Optional[int] = None) -> PostSchema:
    tags_raw = post.tags or "[]"
    try:
        tags = json.loads(tags_raw)
    except (json.JSONDecodeError, TypeError):
        tags = []
    comment_count = db.query(Comment).filter(Comment.post_id == post.id).count()
    is_liked = (
        db.query(RewardPoint)
        .filter(
            RewardPoint.user_id == viewer_id,
            RewardPoint.reason == "like_given",
            RewardPoint.reference_id == post.id,
        )
        .first()
        is not None
    ) if viewer_id else False
    return PostSchema(
        id=post.id,
        video_id=post.video_id,
        user_id=post.user_id,
        caption=post.caption,
        tags=tags,
        like_count=post.like_count,
        view_count=post.view_count,
        comment_count=comment_count,
        is_liked=is_liked,
        created_at=post.created_at,
        cdn_url=post.video.cdn_url,
        username=post.user.username,
    )


@router.get("")
def get_feed(
    cursor: Optional[int] = None,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
) -> dict:
    limit = min(limit, 20)
    query = (
        db.query(Post)
        .join(Post.video)
        .filter(Video.status == "active")
        .order_by(Post.id.desc())
    )
    if cursor is not None:
        query = query.filter(Post.id < cursor)

    posts = query.limit(limit + 1).all()
    has_more = len(posts) > limit
    posts = posts[:limit]

    next_cursor = posts[-1].id if has_more and posts else None
    viewer_id = current_user.id if current_user else None
    return {
        "data": {
            "posts": [_post_to_schema(p, db, viewer_id) for p in posts],
            "next_cursor": next_cursor,
        }
    }


@router.post("/{post_id}/like")
def like_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_required_user),
) -> dict:
    post = db.query(Post).filter(Post.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")

    existing_like = (
        db.query(RewardPoint)
        .filter(
            RewardPoint.user_id == current_user.id,
            RewardPoint.reason == "like_given",
            RewardPoint.reference_id == post_id,
        )
        .first()
    )

    if existing_like:
        db.delete(existing_like)
        post.like_count = max(0, post.like_count - 1)
        db.commit()
        return {"data": {"liked": False, "like_count": post.like_count}}

    like_record = RewardPoint(
        user_id=current_user.id,
        week_label=get_week_label(),
        points=0,
        reason="like_given",
        reference_id=post_id,
    )
    db.add(like_record)

    if post.user_id != current_user.id:
        add_points(db, post.user_id, POINTS_PER_LIKE_RECEIVED, "like_received", post_id)

    post.like_count += 1
    db.commit()
    return {"data": {"liked": True, "like_count": post.like_count}}


@router.post("/{post_id}/view")
def view_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_required_user),
) -> dict:
    post = db.query(Post).filter(Post.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")

    now_utc = datetime.now(timezone.utc)
    today_start = datetime(now_utc.year, now_utc.month, now_utc.day)
    already_viewed = (
        db.query(RewardPoint)
        .filter(
            RewardPoint.user_id == current_user.id,
            RewardPoint.reason == "view_given",
            RewardPoint.reference_id == post_id,
            RewardPoint.created_at >= today_start,
        )
        .first()
    )

    post.view_count += 1

    if not already_viewed:
        view_record = RewardPoint(
            user_id=current_user.id,
            week_label=get_week_label(),
            points=0,
            reason="view_given",
            reference_id=post_id,
        )
        db.add(view_record)

        if post.user_id != current_user.id:
            add_points(db, post.user_id, POINTS_PER_VIEW_RECEIVED, "view_received", post_id)

    db.commit()
    return {"data": {"view_count": post.view_count}}
