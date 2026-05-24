from datetime import datetime

from pydantic import BaseModel


class VideoSchema(BaseModel):
    id: int
    user_id: int
    r2_key: str
    cdn_url: str
    duration_sec: int | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PresignedUrlRequest(BaseModel):
    filename: str
    content_type: str
    file_size: int
    file_hash: str


class PresignedUrlResponse(BaseModel):
    upload_url: str
    r2_key: str


class ConfirmUploadRequest(BaseModel):
    r2_key: str
    file_hash: str = ""  # SHA256 hash, passed through from presigned-url step
    duration_sec: int
    caption: str | None = None
    tags: list[str] | None = None
    challenge_id: int | None = None


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

    model_config = {"from_attributes": True}
