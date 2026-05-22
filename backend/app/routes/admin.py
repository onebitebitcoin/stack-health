from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
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
    return {"data": {"videos": [VideoSchema.model_validate(v) for v in videos]}}


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
