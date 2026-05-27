import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.models.post_like import PostLike
from app.models.post_view import PostView
from app.models.video import Video
from app.models.user import User
from app.routes.auth import get_current_user, get_optional_user
from app.schemas.video import PostSchema

KST = timezone(timedelta(hours=9))

router = APIRouter(prefix="/api/v1/feed", tags=["feed"])


def _post_to_schema(
    post: Post,
    comment_counts: dict,
    liked_post_ids: set,
) -> PostSchema:
    tags_raw = post.tags or "[]"
    try:
        tags = json.loads(tags_raw)
    except (json.JSONDecodeError, TypeError):
        tags = []
    return PostSchema(
        id=post.id,
        video_id=post.video_id,
        user_id=post.user_id,
        caption=post.caption,
        tags=tags,
        like_count=post.like_count,
        view_count=post.view_count,
        comment_count=comment_counts.get(post.id, 0),
        is_liked=post.id in liked_post_ids,
        created_at=post.created_at,
        cdn_url=post.video.cdn_url,
        username=post.user.username,
        workout_start=post.workout_start,
        workout_end=post.workout_end,
        share_token=post.share_token,
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

    post_ids = [p.id for p in posts]
    comment_counts: dict = {}
    liked_post_ids: set = set()

    if post_ids:
        comment_counts = dict(
            db.query(Comment.post_id, func.count(Comment.id))
            .filter(Comment.post_id.in_(post_ids))
            .group_by(Comment.post_id)
            .all()
        )
        if viewer_id:
            liked_rows = (
                db.query(PostLike.post_id)
                .filter(
                    PostLike.user_id == viewer_id,
                    PostLike.post_id.in_(post_ids),
                )
                .all()
            )
            liked_post_ids = {r.post_id for r in liked_rows}

    return {
        "data": {
            "posts": [_post_to_schema(p, comment_counts, liked_post_ids) for p in posts],
            "next_cursor": next_cursor,
        }
    }


@router.post("/{post_id}/like")
def like_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    post = db.query(Post).filter(Post.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")

    existing_like = (
        db.query(PostLike)
        .filter(PostLike.user_id == current_user.id, PostLike.post_id == post_id)
        .first()
    )

    if existing_like:
        db.delete(existing_like)
        post.like_count = max(0, post.like_count - 1)
        db.commit()
        return {"data": {"liked": False, "like_count": post.like_count}}

    like_record = PostLike(user_id=current_user.id, post_id=post_id)
    db.add(like_record)

    post.like_count += 1
    db.commit()
    return {"data": {"liked": True, "like_count": post.like_count}}


@router.post("/{post_id}/view")
def view_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    post = db.query(Post).filter(Post.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")

    now_utc = datetime.now(timezone.utc)
    today_start = datetime(now_utc.year, now_utc.month, now_utc.day)
    already_viewed = (
        db.query(PostView)
        .filter(
            PostView.user_id == current_user.id,
            PostView.post_id == post_id,
            PostView.created_at >= today_start,
        )
        .first()
    )

    post.view_count += 1

    if not already_viewed:
        db.add(PostView(user_id=current_user.id, post_id=post_id))

    db.commit()
    return {"data": {"view_count": post.view_count}}
