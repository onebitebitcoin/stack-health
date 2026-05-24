from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.challenge import ChallengeParticipation
from app.models.post import Post
from app.models.user import User
from app.models.video import Video

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
    like_count: int
    view_count: int
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


@router.get("/{user_id}/profile")
def get_user_profile(user_id: int, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.is_banned:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    posts_raw = (
        db.query(Post)
        .join(Post.video)
        .filter(Post.user_id == user_id, Video.status == "active")
        .order_by(Post.created_at.desc())
        .limit(50)
        .all()
    )
    posts = [
        PublicPostSchema(
            id=p.id,
            cdn_url=p.video.cdn_url,
            like_count=p.like_count,
            view_count=p.view_count,
            caption=p.caption,
            created_at=p.created_at,
        )
        for p in posts_raw
    ]

    participations = (
        db.query(ChallengeParticipation)
        .filter(ChallengeParticipation.user_id == user_id)
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
            "post_count": len(posts),
            "posts": posts,
            "titles": titles,
            "active_challenges": active_challenges,
        }
    }
