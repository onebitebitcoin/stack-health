from datetime import datetime

from pydantic import BaseModel


class RewardSummarySchema(BaseModel):
    week_label: str
    current_week_points: float
    fixed_week_points: float = 0.0
    queued_week_points: float = 0.0


class ClaimRequest(BaseModel):
    ln_address: str | None = None
    challenge_id: int | None = None


class ClaimSchema(BaseModel):
    id: int
    user_id: int
    challenge_id: int | None = None
    week_label: str
    points_used: float
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
