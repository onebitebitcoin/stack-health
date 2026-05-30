from datetime import datetime

from pydantic import BaseModel


class UserSchema(BaseModel):
    id: int
    email: str | None
    username: str
    lightning_address: str | None
    avatar_url: str | None
    is_admin: bool
    app_settings: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UpdateProfileRequest(BaseModel):
    username: str | None = None
    lightning_address: str | None = None
    app_settings: dict | None = None


class TokenResponse(BaseModel):
    access_token: str
    user: UserSchema
