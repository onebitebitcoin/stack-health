from datetime import timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.models.reward import RewardPoint
from app.models.user import User
from app.routes.auth import get_current_user
from app.services.reward import POINTS_PER_COMMENT, REWARD_STATUS_FIXED, add_points, _parse_tz
from app.services.error_codes import (
    api_error,
    E_BANNED,
    E_COMMENT_DAILY_LIMIT,
    E_COMMENT_NOT_FOUND,
    E_COMMENT_TOO_LONG,
    E_COMMENT_TOO_SHORT,
    E_FORBIDDEN,
    E_POST_NOT_FOUND,
)

router = APIRouter(prefix="/api/v1/feed", tags=["comments"])

DAILY_COMMENT_LIMIT = 10
MIN_COMMENT_LENGTH = 5


def _get_daily_comment_count(db: Session, user_id: int, tz: ZoneInfo = ZoneInfo("UTC")) -> int:
    from datetime import datetime, timezone
    now_client = datetime.now(tz)
    today_start_client = now_client.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end_client = today_start_client + timedelta(days=1)
    today_start = today_start_client.astimezone(timezone.utc)
    today_end = today_end_client.astimezone(timezone.utc)
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
        raise api_error(404, E_POST_NOT_FOUND, "게시물을 찾을 수 없습니다")
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
    x_client_timezone: str = Header(default="UTC"),
) -> dict:
    if current_user.is_banned:
        raise api_error(403, E_BANNED, "계정이 정지된 상태입니다")
    post = db.query(Post).filter(Post.id == post_id).first()
    if post is None:
        raise api_error(404, E_POST_NOT_FOUND, "게시물을 찾을 수 없습니다")
    content = body.content.strip()
    if len(content) < MIN_COMMENT_LENGTH:
        raise api_error(422, E_COMMENT_TOO_SHORT, f"댓글은 {MIN_COMMENT_LENGTH}자 이상 입력해주세요")
    if len(content) > 500:
        raise api_error(422, E_COMMENT_TOO_LONG, "댓글은 500자 이하로 입력해주세요")
    if _get_daily_comment_count(db, current_user.id, _parse_tz(x_client_timezone)) >= DAILY_COMMENT_LIMIT:
        raise api_error(429, E_COMMENT_DAILY_LIMIT, f"하루에 댓글은 {DAILY_COMMENT_LIMIT}개까지 작성할 수 있습니다")
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
        raise api_error(404, E_COMMENT_NOT_FOUND, "댓글을 찾을 수 없습니다")
    if comment.user_id != current_user.id and not current_user.is_admin:
        raise api_error(403, E_FORBIDDEN, "이 작업을 수행할 권한이 없습니다")
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
