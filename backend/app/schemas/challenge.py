from datetime import datetime

from pydantic import BaseModel


class ChallengeSchema(BaseModel):
    id: int
    title: str
    description: str
    reward_title: str
    condition_value: int
    start_date: datetime
    end_date: datetime
    is_active: bool
    participant_count: int = 0
    my_upload_count: int = 0
    joined: bool = False
    completed: bool = False

    model_config = {"from_attributes": True}


class ChallengeParticipationSchema(BaseModel):
    id: int
    challenge_id: int
    upload_count: int
    completed_at: datetime | None
    joined_at: datetime
    challenge: ChallengeSchema

    model_config = {"from_attributes": True}


class EarnedTitleSchema(BaseModel):
    title: str
    challenge_title: str
    completed_at: datetime
