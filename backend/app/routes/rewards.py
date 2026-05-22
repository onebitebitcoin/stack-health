import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.claim import LightningClaim
from app.models.user import User
from app.routes.auth import get_current_user
from app.schemas.reward import ClaimRequest, ClaimSchema, RewardSummarySchema
from app.services.blink import pay_lightning_address
from app.services.reward import (
    MIN_CLAIM_SATS,
    get_week_label,
    get_week_claim_deadline,
    get_weekly_points,
    has_claimed_this_week,
    points_to_sats,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/rewards", tags=["rewards"])


@router.get("/summary")
def get_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    week_label = get_week_label()
    pts = get_weekly_points(db, current_user.id, week_label)
    sats = points_to_sats(pts)
    claimed = has_claimed_this_week(db, current_user.id, week_label)
    claimable = sats >= MIN_CLAIM_SATS and not claimed
    deadline = get_week_claim_deadline(week_label)

    return {
        "data": RewardSummarySchema(
            week_label=week_label,
            current_week_points=pts,
            satoshi_amount=sats,
            claimable=claimable,
            claim_deadline=deadline,
            next_claim_date=deadline,
        )
    }


@router.post("/claim")
def create_claim(
    req: ClaimRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    week_label = get_week_label()

    if has_claimed_this_week(db, current_user.id, week_label):
        raise HTTPException(status_code=409, detail="Already claimed this week")

    pts = get_weekly_points(db, current_user.id, week_label)
    sats = points_to_sats(pts)

    if sats < MIN_CLAIM_SATS:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum {MIN_CLAIM_SATS} sats required (you have {sats})",
        )

    ln_address = req.ln_address or current_user.lightning_address
    if not ln_address:
        raise HTTPException(status_code=400, detail="Lightning address required")

    claim = LightningClaim(
        user_id=current_user.id,
        week_label=week_label,
        points_used=pts,
        satoshi_amount=sats,
        ln_address=ln_address,
        status="pending",
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)

    if settings.blink_api_key:
        result = pay_lightning_address(ln_address, sats)
        if result["success"]:
            claim.status = "paid"
        else:
            claim.status = "failed"
            logger.error("Blink payment failed for claim %s: %s", claim.id, result["error"])
        db.commit()

    return {"data": {"claim": ClaimSchema.model_validate(claim)}}


@router.get("/claims")
def list_claims(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    claims = (
        db.query(LightningClaim)
        .filter(LightningClaim.user_id == current_user.id)
        .order_by(LightningClaim.created_at.desc())
        .all()
    )
    return {"data": {"claims": [ClaimSchema.model_validate(c) for c in claims]}}
