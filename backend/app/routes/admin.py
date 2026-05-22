from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.admin_log import AdminLog
from app.models.claim import LightningClaim
from app.models.video import Video
from app.models.user import User
from app.schemas.reward import ClaimSchema, ClaimWithUserSchema
from app.schemas.video import VideoSchema

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(x_admin_key: str = Header(...)) -> None:
    if x_admin_key != settings.admin_secret_key:
        raise HTTPException(status_code=403, detail="Invalid admin key")


@router.get("/claims")
def list_claims(
    status: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> dict:
    query = db.query(LightningClaim)
    if status:
        query = query.filter(LightningClaim.status == status)
    claims = query.order_by(LightningClaim.created_at.desc()).limit(limit).all()

    result = []
    for c in claims:
        user = db.query(User).filter(User.id == c.user_id).first()
        schema = ClaimWithUserSchema(
            **ClaimSchema.model_validate(c).model_dump(),
            username=user.username if user else "",
            email=user.email if user else "",
        )
        result.append(schema)

    return {"data": {"claims": result}}


@router.patch("/claims/{claim_id}/mark-paid")
def mark_paid(
    claim_id: int,
    payment_memo: Optional[str] = None,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> dict:
    claim = db.query(LightningClaim).filter(LightningClaim.id == claim_id).first()
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")

    claim.status = "paid"
    if payment_memo is not None:
        claim.payment_memo = payment_memo
    db.commit()
    db.refresh(claim)
    return {"data": {"claim": ClaimSchema.model_validate(claim)}}


@router.get("/videos")
def list_videos(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> dict:
    videos = db.query(Video).order_by(Video.created_at.desc()).all()
    result = []
    for v in videos:
        user = db.query(User).filter(User.id == v.user_id).first()
        result.append({
            "id": v.id,
            "user_id": v.user_id,
            "username": user.username if user else "",
            "r2_key": v.r2_key,
            "cdn_url": v.cdn_url,
            "duration_sec": v.duration_sec,
            "status": v.status,
            "created_at": v.created_at.isoformat(),
        })
    return {"data": {"videos": result}}


@router.patch("/videos/{video_id}/reject")
def reject_video(
    video_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> dict:
    video = db.query(Video).filter(Video.id == video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")

    video.status = "rejected"
    db.commit()
    db.refresh(video)
    return {"data": {"video": VideoSchema.model_validate(video)}}


@router.delete("/videos/{video_id}")
def delete_video(
    video_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> dict:
    video = db.query(Video).filter(Video.id == video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    video.status = "deleted"
    log = AdminLog(
        action="video_delete",
        target_type="video",
        target_id=video_id,
        detail=video.r2_key,
    )
    db.add(log)
    db.commit()
    return {"data": {"video_id": video_id, "status": "deleted"}}


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> dict:
    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        video_count = (
            db.query(Video)
            .filter(Video.user_id == u.id, Video.status == "active")
            .count()
        )
        result.append({
            "id": u.id,
            "email": u.email,
            "username": u.username,
            "is_banned": u.is_banned,
            "is_admin": u.is_admin,
            "video_count": video_count,
            "created_at": u.created_at.isoformat(),
        })
    return {"data": {"users": result}}


@router.patch("/users/{user_id}/ban")
def toggle_ban(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_banned = not user.is_banned
    log = AdminLog(
        action="ban_toggle",
        target_type="user",
        target_id=user_id,
        detail=f"is_banned={user.is_banned}",
    )
    db.add(log)
    db.commit()
    db.refresh(user)
    return {"data": {"user_id": user_id, "is_banned": user.is_banned}}
