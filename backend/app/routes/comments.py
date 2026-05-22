from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.models.user import User
from app.services.auth import decode_token, get_user_by_id

router = APIRouter(prefix="/api/v1/feed", tags=["comments"])
bearer_required = HTTPBearer()


class CreateCommentRequest(BaseModel):
    content: str


def _get_required_user(
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


@router.get("/{post_id}/comments")
def list_comments(post_id: int, db: Session = Depends(get_db)) -> dict:
    post = db.query(Post).filter(Post.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
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
    current_user: User = Depends(_get_required_user),
) -> dict:
    if current_user.is_banned:
        raise HTTPException(status_code=403, detail="Banned users cannot comment")
    post = db.query(Post).filter(Post.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Content cannot be empty")
    if len(content) > 500:
        raise HTTPException(status_code=422, detail="Content too long")
    comment = Comment(post_id=post_id, user_id=current_user.id, content=content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {"data": {"comment": {
        "id": comment.id,
        "post_id": comment.post_id,
        "user_id": comment.user_id,
        "username": current_user.username,
        "content": comment.content,
        "created_at": comment.created_at.isoformat(),
    }}}


@router.delete("/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_get_required_user),
) -> dict:
    comment = db.query(Comment).filter(
        Comment.id == comment_id, Comment.post_id == post_id
    ).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(comment)
    db.commit()
    return {"data": {"deleted": True}}
