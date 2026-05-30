from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.models.user import User
from app.routes.auth import get_current_user

router = APIRouter(prefix="/api/v1/feed", tags=["comments"])


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
    if not content:
        raise HTTPException(status_code=422, detail="댓글 내용을 입력해주세요")
    if len(content) > 500:
        raise HTTPException(status_code=422, detail="댓글이 너무 깁니다")
    comment = Comment(post_id=post_id, user_id=current_user.id, content=content)
    db.add(comment)
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
    db.delete(comment)
    db.commit()
    return {"data": {"deleted": True}}
