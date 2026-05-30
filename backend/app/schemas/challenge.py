from datetime import datetime

from pydantic import BaseModel


class ChallengeSchema(BaseModel):
    id: int
    title: str
    description: str
    reward_title: str
    condition_value: int
    goal_description: str | None = None
    start_date: datetime
    end_date: datetime
    recruit_start: datetime | None = None
    recruit_end: datetime | None = None
    max_participants: int | None = None
    is_recruiting: bool = True
    is_active: bool
    categories: list[str] = []
    participant_count: int = 0
    my_upload_count: int = 0
    joined: bool = False
    completed: bool = False
    creator_id: int | None = None
    creator_username: str | None = None
    image_url: str | None = None
    image_thumb_url: str | None = None

    model_config = {"from_attributes": True}


class ChallengeCreateRequest(BaseModel):
    title: str
    description: str
    reward_title: str
    condition_value: int = 30
    goal_description: str | None = None
    start_date: datetime
    end_date: datetime
    recruit_start: datetime | None = None
    recruit_end: datetime | None = None
    max_participants: int | None = None
    categories: list[str] = []


class ChallengeUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    reward_title: str | None = None
    condition_value: int | None = None
    goal_description: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    recruit_start: datetime | None = None
    recruit_end: datetime | None = None
    max_participants: int | None = None
    categories: list[str] | None = None


class EarnedTitleSchema(BaseModel):
    title: str
    challenge_title: str
    completed_at: datetime
