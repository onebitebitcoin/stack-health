from datetime import datetime

from pydantic import BaseModel


class VideoSchema(BaseModel):
    id: int
    user_id: int
    r2_key: str
    cdn_url: str
    duration_sec: int | None
    subtitle_url: str | None = None
    subtitle_text: str | None = None
    subtitle_status: str = "skipped"
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PresignedUrlRequest(BaseModel):
    filename: str
    content_type: str
    file_size: int


class PresignedUrlResponse(BaseModel):
    upload_url: str
    r2_key: str


class ConfirmUploadRequest(BaseModel):
    r2_key: str
    duration_sec: int
    caption: str | None = None
    tags: list[str] | None = None
    challenge_id: int | None = None
    workout_start: str | None = None
    workout_end: str | None = None
    proof_image_url: str | None = None


class PostSchema(BaseModel):
    id: int
    video_id: int
    user_id: int
    caption: str | None
    tags: list[str]
    like_count: int
    view_count: int
    comment_count: int
    is_liked: bool = False
    created_at: datetime
    cdn_url: str
    username: str
    workout_start: str | None = None
    workout_end: str | None = None
    share_token: str = ""
    thumbnail_url: str | None = None
    subtitle_url: str | None = None
    subtitle_text: str | None = None
    subtitle_status: str = "skipped"
    avatar_url: str | None = None
    profile_color: str | None = None
    challenge_id: int | None = None

    model_config = {"from_attributes": True}
