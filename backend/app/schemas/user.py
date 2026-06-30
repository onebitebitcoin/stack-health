from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


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
    email: EmailStr
    username: str = Field(min_length=2, max_length=30)
    password: str = Field(min_length=8, max_length=100)
    referral_code: str | None = Field(default=None, max_length=16)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=100)


class UpdateProfileRequest(BaseModel):
    username: str | None = None
    lightning_address: str | None = None
    app_settings: dict | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    user: UserSchema


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
