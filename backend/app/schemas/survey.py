from datetime import datetime

from pydantic import BaseModel


class SurveyCreateRequest(BaseModel):
    title: str
    description: str | None = None
    questions: list = []
    closes_at: datetime | None = None


class SurveyUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    questions: list | None = None
    closes_at: datetime | None = None
    is_open: bool | None = None


class SurveyResponseSubmit(BaseModel):
    answers: dict

    model_config = {"from_attributes": True}
