from datetime import datetime

from pydantic import BaseModel


class RewardSummarySchema(BaseModel):
    week_label: str
    current_week_points: int
    fixed_week_points: int = 0
    queued_week_points: int = 0
    satoshi_amount: int
    claimable: bool
    deadline: datetime
    already_claimed: bool = False
    claim_deadline: datetime
    next_claim_date: datetime


class ClaimRequest(BaseModel):
    ln_address: str | None = None


class ClaimSchema(BaseModel):
    id: int
    user_id: int
    week_label: str
    points_used: int
    satoshi_amount: int
    ln_address: str
    status: str
    payment_memo: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClaimWithUserSchema(ClaimSchema):
    username: str
    email: str
