import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.claim import LightningClaim
from app.models.user import User
from app.routes.auth import get_active_user, get_current_user
from app.schemas.reward import ClaimRequest, ClaimSchema, RewardSummarySchema
from app.services.reward import (
    get_total_weekly_points_all_users,
    get_week_label,
    get_week_claim_deadline,
    get_weekly_queued_points,
    get_weekly_points,
    has_claimed_this_week,
    points_to_sats,
    settle_queued_rewards,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/rewards", tags=["rewards"])


@router.get("/summary")
def get_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    week_label = get_week_label()
    settled_count = settle_queued_rewards(db, current_user.id)
    if settled_count:
        db.commit()

    fixed_pts = get_weekly_points(db, current_user.id, week_label)
    queued_pts = get_weekly_queued_points(db, current_user.id)
    total_pts = get_total_weekly_points_all_users(db, week_label)
    contribution_pct = round(fixed_pts / total_pts * 100, 1) if total_pts > 0 else 0.0
    sats = points_to_sats(fixed_pts)
    claimed = has_claimed_this_week(db, current_user.id, week_label)
    claimable = not claimed
    deadline = get_week_claim_deadline(week_label)

    return {
        "data": RewardSummarySchema(
            week_label=week_label,
            current_week_points=fixed_pts,
            fixed_week_points=fixed_pts,
            queued_week_points=queued_pts,
            satoshi_amount=sats,
            claimable=claimable,
            already_claimed=claimed,
            deadline=deadline,
            claim_deadline=deadline,
            next_claim_date=deadline,
            contribution_pct=contribution_pct,
        )
    }


@router.post("/claim")
def create_claim(
    req: ClaimRequest,
    current_user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
) -> dict:
    week_label = get_week_label()
    settled_count = settle_queued_rewards(db, current_user.id)
    if settled_count:
        db.commit()

    if has_claimed_this_week(db, current_user.id, week_label):
        raise HTTPException(status_code=409, detail="이번 주에 이미 청구하셨습니다")

    pts = get_weekly_points(db, current_user.id, week_label)
    sats = points_to_sats(pts)

    ln_address = req.ln_address or current_user.lightning_address
    if not ln_address:
        raise HTTPException(status_code=400, detail="라이트닝 주소를 먼저 등록해주세요")

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
