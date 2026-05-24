from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserSchema,
)
from app.services.auth import (
    create_access_token,
    decode_token,
    get_user_by_email,
    get_user_by_id,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    user_id = decode_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    if get_user_by_email(db, req.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        email=req.email,
        username=req.username,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return {"data": TokenResponse(access_token=token, user=UserSchema.model_validate(user))}


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)) -> dict:
    user = get_user_by_email(db, req.email)
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user.id)
    return {"data": TokenResponse(access_token=token, user=UserSchema.model_validate(user))}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)) -> dict:
    return {"data": UserSchema.model_validate(current_user)}


@router.patch("/me")
def update_me(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if req.username is not None:
        existing = db.query(User).filter(
            User.username == req.username, User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = req.username
    if req.lightning_address is not None:
        current_user.lightning_address = req.lightning_address
    if req.app_settings is not None:
        current_user.app_settings = req.app_settings

    db.commit()
    db.refresh(current_user)
    return {"data": UserSchema.model_validate(current_user)}
