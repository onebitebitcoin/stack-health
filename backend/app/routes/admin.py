from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.admin_log import AdminLog
from app.models.challenge import ChallengeParticipation
from app.models.claim import LightningClaim
from app.models.reward import RewardPoint
from app.models.video import Video
from app.models.user import User
from app.routes.auth import get_current_user
from app.schemas.reward import ClaimSchema, ClaimWithUserSchema
from app.schemas.video import VideoSchema
from app.services.reward import (
    REWARD_STATUS_FIXED,
    get_week_label,
    points_to_sats,
    revoke_queued_upload_reward,
    settle_queued_rewards,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")
    return current_user


@router.get("/claims")
def list_claims(
    status: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    query = db.query(LightningClaim)
    if status:
        query = query.filter(LightningClaim.status == status)
    claims = query.order_by(LightningClaim.created_at.desc()).limit(limit).all()

    user_ids = [c.user_id for c in claims]
    users_map = {
        u.id: u
        for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}

    result = []
    for c in claims:
        user = users_map.get(c.user_id)
        schema = ClaimWithUserSchema(
            **ClaimSchema.model_validate(c).model_dump(),
            username=user.username if user else "",
            email=user.email if user else "",
        )
        result.append(schema)

    return {"data": {"claims": result}}


@router.patch("/claims/{claim_id}/mark-paid")
def mark_paid(
    claim_id: int,
    payment_memo: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    claim = db.query(LightningClaim).filter(LightningClaim.id == claim_id).first()
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")

    claim.status = "paid"
    if payment_memo is not None:
        claim.payment_memo = payment_memo
    db.commit()
    db.refresh(claim)
    return {"data": {"claim": ClaimSchema.model_validate(claim)}}


@router.get("/videos")
def list_videos(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    videos = db.query(Video).order_by(Video.created_at.desc()).all()
    video_user_ids = [v.user_id for v in videos]
    video_users_map = {
        u.id: u
        for u in db.query(User).filter(User.id.in_(video_user_ids)).all()
    } if video_user_ids else {}

    result = [
        {
            "id": v.id,
            "user_id": v.user_id,
            "username": video_users_map[v.user_id].username if v.user_id in video_users_map else "",
            "r2_key": v.r2_key,
            "cdn_url": v.cdn_url,
            "duration_sec": v.duration_sec,
            "status": v.status,
            "created_at": v.created_at.isoformat(),
        }
        for v in videos
    ]
    return {"data": {"videos": result}}


@router.patch("/videos/{video_id}/reject")
def reject_video(
    video_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    video = db.query(Video).filter(Video.id == video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")

    revoke_queued_upload_reward(db, video.id)
    video.status = "rejected"
    db.commit()
    db.refresh(video)
    return {"data": {"video": VideoSchema.model_validate(video)}}


@router.delete("/videos/{video_id}")
def delete_video(
    video_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    video = db.query(Video).filter(Video.id == video_id).first()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    revoke_queued_upload_reward(db, video.id)
    video.status = "deleted"
    log = AdminLog(
        action="video_delete",
        target_type="video",
        target_id=video_id,
        detail=video.r2_key,
    )
    db.add(log)
    db.commit()
    return {"data": {"video_id": video_id, "status": "deleted"}}


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    settled_count = settle_queued_rewards(db)
    if settled_count:
        db.commit()

    users = db.query(User).order_by(User.created_at.desc()).all()
    user_ids = [u.id for u in users]

    video_counts: dict = {}
    point_totals: dict = {}
    challenge_counts: dict = {}
    if user_ids:
        video_counts = dict(
            db.query(Video.user_id, func.count(Video.id))
            .filter(Video.user_id.in_(user_ids), Video.status == "active")
            .group_by(Video.user_id)
            .all()
        )
        point_totals = dict(
            db.query(RewardPoint.user_id, func.sum(RewardPoint.points))
            .filter(
                RewardPoint.user_id.in_(user_ids),
                RewardPoint.status == REWARD_STATUS_FIXED,
            )
            .group_by(RewardPoint.user_id)
            .all()
        )
        challenge_counts = dict(
            db.query(ChallengeParticipation.user_id, func.count(ChallengeParticipation.id))
            .filter(ChallengeParticipation.user_id.in_(user_ids))
            .group_by(ChallengeParticipation.user_id)
            .all()
        )

    result = [
        {
            "id": u.id,
            "email": u.email,
            "username": u.username,
            "lightning_address": u.lightning_address,
            "is_banned": u.is_banned,
            "is_admin": u.is_admin,
            "video_count": video_counts.get(u.id, 0),
            "total_points": point_totals.get(u.id, 0),
            "challenge_count": challenge_counts.get(u.id, 0),
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]
    return {"data": {"users": result}}


@router.patch("/users/{user_id}/ban")
def toggle_ban(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_banned = not user.is_banned
    log = AdminLog(
        action="ban_toggle",
        target_type="user",
        target_id=user_id,
        detail=f"is_banned={user.is_banned}",
    )
    db.add(log)
    db.commit()
    db.refresh(user)
    return {"data": {"user_id": user_id, "is_banned": user.is_banned}}


@router.get("/users/{user_id}")
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    settled_count = settle_queued_rewards(db, user_id)
    if settled_count:
        db.commit()

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    videos = (
        db.query(Video)
        .filter(Video.user_id == user_id)
        .order_by(Video.created_at.desc())
        .limit(20)
        .all()
    )

    participations = (
        db.query(ChallengeParticipation)
        .filter(ChallengeParticipation.user_id == user_id)
        .order_by(ChallengeParticipation.joined_at.desc())
        .all()
    )

    points_by_week = (
        db.query(RewardPoint.week_label, func.sum(RewardPoint.points).label("pts"))
        .filter(
            RewardPoint.user_id == user_id,
            RewardPoint.status == REWARD_STATUS_FIXED,
        )
        .group_by(RewardPoint.week_label)
        .order_by(RewardPoint.week_label.desc())
        .limit(10)
        .all()
    )

    claims = (
        db.query(LightningClaim)
        .filter(LightningClaim.user_id == user_id)
        .order_by(LightningClaim.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "data": {
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "lightning_address": user.lightning_address,
                "is_banned": user.is_banned,
                "is_admin": user.is_admin,
                "created_at": user.created_at.isoformat(),
            },
            "videos": [
                {
                    "id": v.id,
                    "cdn_url": v.cdn_url,
                    "status": v.status,
                    "created_at": v.created_at.isoformat(),
                }
                for v in videos
            ],
            "challenges": [
                {
                    "challenge_id": p.challenge_id,
                    "title": p.challenge.title if p.challenge else "",
                    "upload_count": p.upload_count,
                    "condition_value": p.challenge.condition_value if p.challenge else 0,
                    "completed": p.completed_at is not None,
                    "joined_at": p.joined_at.isoformat(),
                }
                for p in participations
            ],
            "points_by_week": [
                {"week_label": row.week_label, "points": row.pts}
                for row in points_by_week
            ],
            "claims": [
                {
                    "id": c.id,
                    "week_label": c.week_label,
                    "points_used": c.points_used,
                    "satoshi_amount": c.satoshi_amount,
                    "ln_address": c.ln_address,
                    "status": c.status,
                    "created_at": c.created_at.isoformat(),
                }
                for c in claims
            ],
        }
    }


@router.get("/weekly-summary")
def weekly_summary(
    week_label: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    wlabel = week_label or get_week_label()
    settled_count = settle_queued_rewards(db)
    if settled_count:
        db.commit()

    base_query = (
        db.query(
            RewardPoint.user_id,
            User.username,
            func.sum(RewardPoint.points).label("weekly_points"),
        )
        .join(User, User.id == RewardPoint.user_id)
        .filter(
            RewardPoint.week_label == wlabel,
            RewardPoint.status == REWARD_STATUS_FIXED,
            User.is_banned.is_(False),
        )
        .group_by(RewardPoint.user_id, User.username)
    )

    total_users: int = base_query.count()

    offset = (page - 1) * limit
    rows = (
        base_query
        .order_by(func.sum(RewardPoint.points).desc(), RewardPoint.user_id.asc())
        .offset(offset)
        .limit(limit + 1)
        .all()
    )

    has_next = len(rows) > limit
    rows = rows[:limit]

    items = [
        {
            "rank": offset + idx + 1,
            "user_id": row.user_id,
            "username": row.username,
            "weekly_points": row.weekly_points,
            "satoshi_amount": points_to_sats(row.weekly_points),
        }
        for idx, row in enumerate(rows)
    ]

    return {
        "data": {
            "week_label": wlabel,
            "items": items,
            "page": page,
            "has_next": has_next,
            "total_users": total_users,
        }
    }
