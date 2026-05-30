import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.claim import LightningClaim
from app.models.user import User
from app.routes.auth import get_current_user
from app.schemas.reward import ClaimSchema, RewardSummarySchema
from app.services.reward import (
    get_week_label,
    get_weekly_queued_points,
    get_weekly_points,
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

    return {
        "data": RewardSummarySchema(
            week_label=week_label,
            current_week_points=fixed_pts,
            fixed_week_points=fixed_pts,
            queued_week_points=queued_pts,
        )
    }


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
