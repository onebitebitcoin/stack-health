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
    categories: list[str] = []
    participant_count: int = 0
    my_upload_count: int = 0
    joined: bool = False
    completed: bool = False
    creator_id: int | None = None
    image_url: str | None = None
    image_thumb_url: str | None = None

    model_config = {"from_attributes": True}


class ChallengeCreateRequest(BaseModel):
    title: str
    description: str
    reward_title: str
    condition_value: int
    start_date: datetime
    end_date: datetime
    categories: list[str] = []


class ChallengeUpdateRequest(BaseModel):
    description: str | None = None
    categories: list[str] | None = None


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
