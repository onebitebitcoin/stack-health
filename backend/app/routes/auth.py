from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.lnauth_challenge import LNAuthChallenge
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
from app.services.google_oauth import exchange_code, get_google_auth_url, get_google_user_info
from app.services.lnauth import encode_lnurl, generate_k1, verify_signature

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
bearer = HTTPBearer()
bearer_optional = HTTPBearer(auto_error=False)


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


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_optional),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    user_id = decode_token(credentials.credentials)
    if user_id is None:
        return None
    return get_user_by_id(db, user_id)


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


# ── Google OAuth ──────────────────────────────────────────────────────

@router.get("/google")
def google_login() -> RedirectResponse:
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    url = get_google_auth_url()
    return RedirectResponse(url=url)


@router.get("/google/callback")
async def google_callback(code: str, db: Session = Depends(get_db)) -> RedirectResponse:
    try:
        tokens = await exchange_code(code)
        user_info = await get_google_user_info(tokens["access_token"])
    except Exception:
        return RedirectResponse(url=f"{settings.frontend_url}/?error=google_auth_failed")

    google_sub = user_info.get("sub")
    email = user_info.get("email")
    name = user_info.get("name") or user_info.get("given_name") or "user"
    avatar = user_info.get("picture")

    user = db.query(User).filter(User.oauth_sub == google_sub, User.oauth_provider == "google").first()
    if user is None and email:
        user = db.query(User).filter(User.email == email).first()

    if user is None:
        base_username = name.lower().replace(" ", "_")[:20]
        username = base_username
        suffix = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}_{suffix}"
            suffix += 1
        user = User(
            email=email,
            username=username,
            password_hash=None,
            oauth_provider="google",
            oauth_sub=google_sub,
            avatar_url=avatar,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.oauth_sub:
            user.oauth_sub = google_sub
            user.oauth_provider = "google"
        if avatar and not user.avatar_url:
            user.avatar_url = avatar
        db.commit()

    token = create_access_token(user.id)
    return RedirectResponse(url=f"{settings.frontend_url}/?google_token={token}")


# ── LNAuth ────────────────────────────────────────────────────────────

@router.get("/lnauth/challenge")
def lnauth_challenge(db: Session = Depends(get_db)) -> dict:
    k1 = generate_k1()
    lnurl = encode_lnurl(k1)
    challenge = LNAuthChallenge(k1=k1)
    db.add(challenge)
    db.commit()
    return {"data": {"k1": k1, "lnurl": lnurl}}


@router.get("/lnauth")
def lnauth_callback(
    tag: str,
    k1: str,
    sig: str | None = None,
    key: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    challenge = db.query(LNAuthChallenge).filter(LNAuthChallenge.k1 == k1).first()
    if not challenge:
        raise HTTPException(status_code=400, detail="Invalid k1")

    if sig is None or key is None:
        return {
            "tag": "login",
            "k1": k1,
            "action": "login",
            "callback": f"{settings.app_base_url}/api/v1/auth/lnauth",
        }

    if not verify_signature(k1, sig, key):
        return {"status": "ERROR", "reason": "Invalid signature"}

    user = db.query(User).filter(User.oauth_sub == key, User.oauth_provider == "lnauth").first()
    if user is None:
        base_username = f"ln_{key[:12]}"
        username = base_username
        suffix = 1
        while db.query(User).filter(User.username == username).first():
            username = f"{base_username}_{suffix}"
            suffix += 1
        user = User(
            email=None,
            username=username,
            password_hash=None,
            oauth_provider="lnauth",
            oauth_sub=key,
        )
        db.add(user)

    challenge.pubkey = key
    challenge.verified = True
    db.commit()

    return {"status": "OK"}


@router.get("/lnauth/verify")
def lnauth_verify(k1: str, db: Session = Depends(get_db)) -> dict:
    challenge = db.query(LNAuthChallenge).filter(LNAuthChallenge.k1 == k1).first()
    if not challenge or not challenge.verified:
        return {"data": {"verified": False}}

    user = db.query(User).filter(
        User.oauth_sub == challenge.pubkey,
        User.oauth_provider == "lnauth",
    ).first()
    if not user:
        return {"data": {"verified": False}}

    token = create_access_token(user.id)
    return {"data": {"verified": True, "token": token}}
