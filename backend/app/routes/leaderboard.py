from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.reward import RewardPoint
from app.models.user import User
from app.routes.feed import get_optional_user
from app.services.reward import get_week_label, points_to_sats

KST = timezone(timedelta(hours=9))

router = APIRouter(prefix="/api/v1/leaderboard", tags=["leaderboard"])


def _get_last_week_label() -> str:
    last_week_dt = datetime.now(KST) - timedelta(weeks=1)
    return get_week_label(last_week_dt)


@router.get("")
def get_leaderboard(
    week: str = "current",
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
) -> dict:
    limit = min(limit, 50)
    wlabel = get_week_label() if week == "current" else _get_last_week_label()

    base_query = (
        db.query(
            RewardPoint.user_id,
            func.sum(RewardPoint.points).label("weekly_points"),
        )
        .join(User, User.id == RewardPoint.user_id)
        .filter(RewardPoint.week_label == wlabel, User.is_banned.is_(False))
        .group_by(RewardPoint.user_id)
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

    items = []
    for idx, row in enumerate(rows):
        user = db.query(User).filter(User.id == row.user_id).first()
        items.append({
            "rank": offset + idx + 1,
            "user_id": row.user_id,
            "username": user.username if user else "알 수 없음",
            "weekly_points": row.weekly_points,
            "satoshi_amount": points_to_sats(row.weekly_points),
        })

    # 본인 순위 (top N에 포함되지 않은 경우에만 별도 제공)
    my_rank = None
    if current_user is not None:
        in_top = any(item["user_id"] == current_user.id for item in items)
        if not in_top:
            # 전체 순위에서 본인 위치 계산
            all_rows = (
                base_query
                .order_by(func.sum(RewardPoint.points).desc(), RewardPoint.user_id.asc())
                .all()
            )
            for i, row in enumerate(all_rows):
                if row.user_id == current_user.id:
                    my_rank = {
                        "rank": i + 1,
                        "user_id": current_user.id,
                        "username": current_user.username,
                        "weekly_points": row.weekly_points,
                        "satoshi_amount": points_to_sats(row.weekly_points),
                    }
                    break

    return {
        "data": {
            "week_label": wlabel,
            "items": items,
            "page": page,
            "has_next": has_next,
            "total_users": total_users,
            "my_rank": my_rank,
        }
    }
