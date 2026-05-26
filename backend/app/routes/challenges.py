import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.challenge import Challenge, ChallengeParticipation
from app.models.user import User
from app.routes.auth import get_current_user, get_optional_user
from app.schemas.challenge import ChallengeCreateRequest, ChallengeSchema, ChallengeUpdateRequest, EarnedTitleSchema
from app.config import settings as app_settings
from app.services import r2 as r2_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/challenges", tags=["challenges"])


def _to_schema(challenge: Challenge, user_id: int | None, db: Session) -> ChallengeSchema:
    participant_count = (
        db.query(func.count(ChallengeParticipation.id))
        .filter(ChallengeParticipation.challenge_id == challenge.id)
        .scalar()
        or 0
    )
    my_upload_count = 0
    joined = False
    completed = False
    if user_id:
        p = (
            db.query(ChallengeParticipation)
            .filter(
                ChallengeParticipation.challenge_id == challenge.id,
                ChallengeParticipation.user_id == user_id,
            )
            .first()
        )
        if p:
            joined = True
            my_upload_count = p.upload_count
            completed = p.completed_at is not None

    return ChallengeSchema(
        id=challenge.id,
        title=challenge.title,
        description=challenge.description,
        reward_title=challenge.reward_title,
        condition_value=challenge.condition_value,
        start_date=challenge.start_date,
        end_date=challenge.end_date,
        is_active=challenge.is_active,
        categories=challenge.categories or [],
        participant_count=participant_count,
        my_upload_count=my_upload_count,
        joined=joined,
        completed=completed,
        creator_id=challenge.creator_id,
        image_url=challenge.image_url,
    )


@router.get("")
def list_challenges(
    q: str | None = Query(None),
    category: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    query = db.query(Challenge).filter(Challenge.is_active == True)  # noqa: E712
    if q:
        query = query.filter(Challenge.title.ilike(f"%{q}%"))
    challenges = query.order_by(Challenge.start_date.desc()).all()
    if category:
        challenges = [c for c in challenges if category in (c.categories or [])]
    uid = current_user.id if current_user else None
    return {"data": {"challenges": [_to_schema(c, uid, db) for c in challenges]}}


@router.post("")
def create_challenge(
    body: ChallengeCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    # 모든 인증된 사용자가 챌린지 생성 가능
    try:
        challenge = Challenge(
            title=body.title,
            description=body.description,
            reward_title=body.reward_title,
            condition_value=body.condition_value,
            start_date=body.start_date,
            end_date=body.end_date,
            categories=body.categories,
            is_active=True,
            creator_id=current_user.id,
        )
        db.add(challenge)
        db.commit()
        db.refresh(challenge)
        logger.info("Challenge created: id=%s title=%r by user_id=%s", challenge.id, challenge.title, current_user.id)
        return {"data": {"challenge": _to_schema(challenge, current_user.id, db)}}
    except Exception as e:
        db.rollback()
        logger.exception("Failed to create challenge for user_id=%s: %s", current_user.id, e)
        raise HTTPException(status_code=500, detail=f"챌린지 생성 실패: {e}")


@router.post("/{challenge_id}/image")
async def upload_challenge_image(
    challenge_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 이미지를 업로드할 수 있습니다")
    challenge = db.get(Challenge, challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail="챌린지를 찾을 수 없습니다")
    content_type = file.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다")
    ext = (file.filename or "img.jpg").rsplit(".", 1)[-1].lower()
    r2_key = f"challenges/{uuid.uuid4()}.{ext}"
    client = r2_service.get_r2_client()
    client.upload_fileobj(
        file.file,
        app_settings.r2_bucket_name,
        r2_key,
        ExtraArgs={"ContentType": content_type},
    )
    image_url = r2_service.get_cdn_url(r2_key)
    challenge.image_url = image_url
    db.commit()
    logger.info("Challenge image uploaded: challenge_id=%s url=%s", challenge_id, image_url)
    return {"data": {"image_url": image_url}}


@router.get("/created")
def my_created_challenges(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    challenges = (
        db.query(Challenge)
        .filter(Challenge.creator_id == current_user.id)
        .order_by(Challenge.created_at.desc())
        .all()
    )
    result = []
    for c in challenges:
        participant_count = (
            db.query(func.count(ChallengeParticipation.id))
            .filter(ChallengeParticipation.challenge_id == c.id)
            .scalar()
            or 0
        )
        completed_count = (
            db.query(func.count(ChallengeParticipation.id))
            .filter(
                ChallengeParticipation.challenge_id == c.id,
                ChallengeParticipation.completed_at != None,  # noqa: E711
            )
            .scalar()
            or 0
        )
        schema = _to_schema(c, current_user.id, db)
        result.append({
            **schema.model_dump(),
            "participant_count": participant_count,
            "completed_count": completed_count,
        })
    return {"data": {"challenges": result}}


@router.get("/my")
def my_challenges(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    participations = (
        db.query(ChallengeParticipation)
        .filter(ChallengeParticipation.user_id == current_user.id)
        .order_by(ChallengeParticipation.joined_at.desc())
        .all()
    )
    result = []
    for p in participations:
        schema = _to_schema(p.challenge, current_user.id, db)
        result.append(schema)
    return {"data": {"challenges": result}}


@router.get("/titles")
def my_titles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    completed = (
        db.query(ChallengeParticipation)
        .filter(
            ChallengeParticipation.user_id == current_user.id,
            ChallengeParticipation.completed_at != None,  # noqa: E711
        )
        .order_by(ChallengeParticipation.completed_at.desc())
        .all()
    )
    titles = [
        EarnedTitleSchema(
            title=p.challenge.reward_title,
            challenge_title=p.challenge.title,
            completed_at=p.completed_at,
        )
        for p in completed
    ]
    return {"data": {"titles": titles}}


@router.post("/{challenge_id}/join")
def join_challenge(
    challenge_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="챌린지를 찾을 수 없습니다")
    if not challenge.is_active:
        raise HTTPException(status_code=400, detail="종료된 챌린지입니다")

    existing = (
        db.query(ChallengeParticipation)
        .filter(
            ChallengeParticipation.challenge_id == challenge_id,
            ChallengeParticipation.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="이미 참여 중인 챌린지입니다")

    participation = ChallengeParticipation(
        user_id=current_user.id,
        challenge_id=challenge_id,
        upload_count=0,
    )
    db.add(participation)
    db.commit()
    db.refresh(participation)
    return {"data": {"joined": True, "challenge_id": challenge_id}}


@router.get("/{challenge_id}/participants")
def challenge_participants(
    challenge_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="챌린지를 찾을 수 없습니다")
    if challenge.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="챌린지 생성자만 접근할 수 있습니다")
    participations = (
        db.query(ChallengeParticipation)
        .filter(ChallengeParticipation.challenge_id == challenge_id)
        .order_by(
            ChallengeParticipation.completed_at.desc().nulls_last(),
            ChallengeParticipation.upload_count.desc(),
        )
        .all()
    )
    result = []
    for p in participations:
        user = db.query(User).filter(User.id == p.user_id).first()
        progress = (
            min(100, round((p.upload_count / challenge.condition_value) * 100))
            if challenge.condition_value > 0
            else 0
        )
        result.append({
            "user_id": p.user_id,
            "username": user.username if user else "",
            "upload_count": p.upload_count,
            "condition_value": challenge.condition_value,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
            "joined_at": p.joined_at.isoformat(),
            "progress": progress,
        })
    return {
        "data": {
            "challenge": _to_schema(challenge, current_user.id, db).model_dump(),
            "participants": result,
        }
    }


@router.get("/{challenge_id}")
def get_challenge(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id, Challenge.is_active == True).first()  # noqa: E712
    if not challenge:
        raise HTTPException(status_code=404, detail="챌린지를 찾을 수 없습니다")
    uid = current_user.id if current_user else None
    return {"data": {"challenge": _to_schema(challenge, uid, db)}}


@router.patch("/{challenge_id}")
def update_challenge(
    challenge_id: int,
    body: ChallengeUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="챌린지를 찾을 수 없습니다")
    if challenge.creator_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다")
    if body.description is not None:
        challenge.description = body.description
    if body.categories is not None:
        challenge.categories = body.categories
    db.commit()
    db.refresh(challenge)
    uid = current_user.id
    return {"data": {"challenge": _to_schema(challenge, uid, db)}}


@router.delete("/{challenge_id}")
def delete_challenge(
    challenge_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="챌린지를 찾을 수 없습니다")
    if challenge.creator_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다")
    challenge.is_active = False
    db.commit()
    logger.info("Challenge deleted: id=%s by user_id=%s", challenge_id, current_user.id)
    return {"data": {"deleted": True}}


def increment_challenge_upload(db: Session, user_id: int, challenge_id: int) -> None:
    participation = (
        db.query(ChallengeParticipation)
        .filter(
            ChallengeParticipation.challenge_id == challenge_id,
            ChallengeParticipation.user_id == user_id,
        )
        .first()
    )
    if not participation:
        raise HTTPException(status_code=400, detail="챌린지에 먼저 참여하세요")

    challenge = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not challenge or not challenge.is_active:
        raise HTTPException(status_code=400, detail="유효하지 않은 챌린지입니다")

    participation.upload_count += 1
    if (
        participation.completed_at is None
        and participation.upload_count >= challenge.condition_value
    ):
        participation.completed_at = datetime.now(timezone.utc)
