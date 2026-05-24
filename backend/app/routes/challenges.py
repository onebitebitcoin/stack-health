from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.challenge import Challenge, ChallengeParticipation
from app.models.user import User
from app.routes.auth import get_current_user
from app.schemas.challenge import ChallengeSchema, EarnedTitleSchema

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
        participant_count=participant_count,
        my_upload_count=my_upload_count,
        joined=joined,
        completed=completed,
    )


@router.get("")
def list_challenges(
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> dict:
    query = db.query(Challenge).filter(Challenge.is_active == True)  # noqa: E712
    if q:
        query = query.filter(Challenge.title.ilike(f"%{q}%"))
    challenges = query.order_by(Challenge.start_date.desc()).all()
    uid = current_user.id if current_user else None
    return {"data": {"challenges": [_to_schema(c, uid, db) for c in challenges]}}


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
