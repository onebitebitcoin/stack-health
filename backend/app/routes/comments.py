from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.models.reward import RewardPoint
from app.models.user import User
from app.routes.auth import get_current_user
from app.services.reward import POINTS_PER_COMMENT, REWARD_STATUS_FIXED, add_points

router = APIRouter(prefix="/api/v1/feed", tags=["comments"])

DAILY_COMMENT_LIMIT = 10
MIN_COMMENT_LENGTH = 5


def _get_daily_comment_count(db: Session, user_id: int) -> int:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    return (
        db.query(Comment)
        .filter(
            Comment.user_id == user_id,
            Comment.created_at >= today_start,
            Comment.created_at < today_end,
        )
        .count()
    )


class CreateCommentRequest(BaseModel):
    content: str


@router.get("/{post_id}/comments")
def list_comments(post_id: int, db: Session = Depends(get_db)) -> dict:
    post = db.query(Post).filter(Post.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")
    comments = (
        db.query(Comment)
        .filter(Comment.post_id == post_id)
        .order_by(Comment.created_at.asc())
        .all()
    )
    result = [
        {
            "id": c.id,
            "post_id": c.post_id,
            "user_id": c.user_id,
            "username": c.user.username if c.user else "",
            "avatar_url": c.user.avatar_url if c.user else None,
            "profile_color": (c.user.app_settings or {}).get("profile_color") if c.user else None,
            "content": c.content,
            "created_at": c.created_at.isoformat(),
        }
        for c in comments
    ]
    return {"data": {"comments": result}}


@router.post("/{post_id}/comments")
def create_comment(
    post_id: int,
    body: CreateCommentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.is_banned:
        raise HTTPException(status_code=403, detail="정지된 계정은 댓글을 작성할 수 없습니다")
    post = db.query(Post).filter(Post.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다")
    content = body.content.strip()
    if len(content) < MIN_COMMENT_LENGTH:
        raise HTTPException(status_code=422, detail=f"댓글은 {MIN_COMMENT_LENGTH}자 이상 입력해주세요")
    if len(content) > 500:
        raise HTTPException(status_code=422, detail="댓글이 너무 깁니다")
    if _get_daily_comment_count(db, current_user.id) >= DAILY_COMMENT_LIMIT:
        raise HTTPException(status_code=429, detail=f"하루 댓글 한도({DAILY_COMMENT_LIMIT}개)에 도달했습니다")
    comment = Comment(post_id=post_id, user_id=current_user.id, content=content)
    db.add(comment)
    db.flush()
    add_points(db, current_user.id, POINTS_PER_COMMENT, "comment", reference_id=comment.id)
    db.commit()
    db.refresh(comment)
    return {"data": {"comment": {
        "id": comment.id,
        "post_id": comment.post_id,
        "user_id": comment.user_id,
        "username": current_user.username,
        "avatar_url": current_user.avatar_url,
        "profile_color": (current_user.app_settings or {}).get("profile_color"),
        "content": comment.content,
        "created_at": comment.created_at.isoformat(),
    }}}


@router.delete("/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    comment = db.query(Comment).filter(
        Comment.id == comment_id, Comment.post_id == post_id
    ).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다")
    if comment.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    # 댓글 포인트 회수 (fixed 포인트를 음수 항목으로 상쇄)
    reward = (
        db.query(RewardPoint)
        .filter(
            RewardPoint.reason == "comment",
            RewardPoint.reference_id == comment.id,
            RewardPoint.user_id == comment.user_id,
        )
        .first()
    )
    if reward:
        db.add(RewardPoint(
            user_id=comment.user_id,
            points=-POINTS_PER_COMMENT,
            reason="comment_revoke",
            reference_id=comment.id,
            status=REWARD_STATUS_FIXED,
        ))
    db.delete(comment)
    db.commit()
    return {"data": {"deleted": True}}
