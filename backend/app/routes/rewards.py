import logging

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.routes.auth import get_current_user
from app.schemas.reward import RewardSummarySchema
from app.services.reward import (
    UTC,
    get_weekly_points,
    get_weekly_queued_points,
    settle_queued_rewards,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/rewards", tags=["rewards"])


@router.get("/summary")
def get_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    x_client_timezone: str = Header(default="UTC"),
) -> dict:
    _ = x_client_timezone  # Accepted for API compatibility; reward settlement uses UTC globally.
    settled_count = settle_queued_rewards(db, current_user.id)
    if settled_count:
        db.commit()

    fixed_pts = get_weekly_points(db, current_user.id, UTC)
    queued_pts = get_weekly_queued_points(db, current_user.id)

    return {
        "data": RewardSummarySchema(
            current_week_points=fixed_pts,
            fixed_week_points=fixed_pts,
            queued_week_points=queued_pts,
        )
    }
