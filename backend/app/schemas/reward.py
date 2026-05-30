from pydantic import BaseModel


class RewardSummarySchema(BaseModel):
    current_week_points: float
    fixed_week_points: float = 0.0
    queued_week_points: float = 0.0
