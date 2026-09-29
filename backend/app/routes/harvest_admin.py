from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.admin_log import AdminLog
from app.models.harvest import HarvestAllocation, HarvestRound
from app.models.user import User
from app.routes.admin import require_admin
from app.services import harvest as harvest_service
from app.services.error_codes import (
    api_error,
    E_HARVEST_ALREADY_PAID,
    E_HARVEST_INVALID_MONTH,
    E_HARVEST_INVALID_RANGE,
    E_HARVEST_ROUND_NOT_ENDED,
    E_HARVEST_ROUND_NOT_FOUND,
    E_HARVEST_ROUND_PAID_DELETE,
    E_HARVEST_ROUND_OVERLAP,
)

router = APIRouter(prefix="/api/v1/admin/harvest", tags=["admin-harvest"])


class RoundCreate(BaseModel):
    start_date: date
    end_date: date
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)


class RoundGenerate(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    cadence: Literal["weekly", "biweekly", "monthly"]


def _get_round(db: Session, round_id: int) -> HarvestRound:
    rnd = db.get(HarvestRound, round_id)
    if rnd is None:
        raise api_error(404, E_HARVEST_ROUND_NOT_FOUND, "회차를 찾을 수 없습니다")
    return rnd


def _round_dict(rnd: HarvestRound, participants: int) -> dict:
    return {
        "id": rnd.id,
        "start_date": rnd.start_date.isoformat(),
        "end_date": rnd.end_date.isoformat(),
        "status": rnd.status,
        "total_oranges": rnd.total_oranges,
        "seed": rnd.seed,
        "paid_at": rnd.paid_at.isoformat() if rnd.paid_at else None,
        "participant_count": participants,
    }


def _participant_count(db: Session, rnd: HarvestRound) -> int:
    """paid는 저장된 배분 행 수, open은 현재 점수가 있는 사용자 수."""
    if rnd.status == "paid":
        return db.query(HarvestAllocation).filter(HarvestAllocation.round_id == rnd.id).count()
    return len(harvest_service.compute_scores(db, rnd.start_date, rnd.end_date))


def _log(db: Session, action: str, round_id: int, detail: str) -> None:
    db.add(AdminLog(action=action, target_type="harvest_round", target_id=round_id, detail=detail))


def _check_range(start: date, end: date) -> None:
    try:
        harvest_service.validate_round_range(start, end)
    except ValueError as exc:
        raise api_error(400, E_HARVEST_INVALID_RANGE, str(exc))


def _overlap_error(other: HarvestRound):
    return api_error(
        409,
        E_HARVEST_ROUND_OVERLAP,
        f"기존 회차({other.start_date}~{other.end_date})와 기간이 겹칩니다",
    )


@router.get("/rounds")
def list_rounds(
    month: str | None = Query(default=None, description="YYYY-MM (생략하면 전체)"),
    db: Session = Depends(get_db),
    _: User | None = Depends(require_admin),
) -> dict:
    q = db.query(HarvestRound)
    if month is not None:
        try:
            year, mon = harvest_service.parse_month(month)
        except ValueError as exc:
            raise api_error(400, E_HARVEST_INVALID_MONTH, str(exc))
        first, last = harvest_service.month_bounds(year, mon)
        q = q.filter(HarvestRound.start_date >= first, HarvestRound.start_date <= last)
    rounds = q.order_by(HarvestRound.start_date, HarvestRound.id).all()
    return {"data": [_round_dict(r, _participant_count(db, r)) for r in rounds]}


@router.post("/rounds", status_code=201)
def create_round(
    body: RoundCreate,
    db: Session = Depends(get_db),
    _: User | None = Depends(require_admin),
) -> dict:
    _check_range(body.start_date, body.end_date)
    other = harvest_service.find_overlap(db, body.start_date, body.end_date)
    if other is not None:
        raise _overlap_error(other)
    seed = body.seed if body.seed is not None else harvest_service.default_seed(body.end_date)
    rnd = HarvestRound(
        start_date=body.start_date,
        end_date=body.end_date,
        seed=seed,
        total_oranges=harvest_service.TOTAL_ORANGES,
        status="open",
    )
    db.add(rnd)
    db.flush()
    _log(db, "harvest_round_create", rnd.id, f"{rnd.start_date}~{rnd.end_date} seed={seed}")
    db.commit()
    db.refresh(rnd)
    return {"data": _round_dict(rnd, 0)}


@router.post("/rounds/generate", status_code=201)
def generate_rounds(
    body: RoundGenerate,
    db: Session = Depends(get_db),
    _: User | None = Depends(require_admin),
) -> dict:
    ranges = harvest_service.month_ranges(body.year, body.month, body.cadence)
    # 하나라도 겹치면 아무것도 만들지 않는다.
    for start, end in ranges:
        other = harvest_service.find_overlap(db, start, end)
        if other is not None:
            raise _overlap_error(other)
    created: list[HarvestRound] = []
    for start, end in ranges:
        rnd = HarvestRound(
            start_date=start,
            end_date=end,
            seed=harvest_service.default_seed(end),
            total_oranges=harvest_service.TOTAL_ORANGES,
            status="open",
        )
        db.add(rnd)
        created.append(rnd)
    db.flush()
    _log(
        db,
        "harvest_round_generate",
        created[0].id,
        f"{body.year:04d}-{body.month:02d} {body.cadence} rounds={len(created)}",
    )
    db.commit()
    for rnd in created:
        db.refresh(rnd)
    return {"data": [_round_dict(r, 0) for r in created]}


@router.get("/rounds/{round_id}")
def get_round(
    round_id: int,
    db: Session = Depends(get_db),
    _: User | None = Depends(require_admin),
) -> dict:
    rnd = _get_round(db, round_id)
    if rnd.status == "paid":
        allocs = (
            db.query(HarvestAllocation, User.username)
            .join(User, User.id == HarvestAllocation.user_id)
            .filter(HarvestAllocation.round_id == rnd.id)
            .order_by(HarvestAllocation.oranges.desc(), HarvestAllocation.user_id)
            .all()
        )
        rows = [
            {
                "user_id": a.user_id,
                "username": username,
                "uploads": a.uploads,
                "comments": a.comments,
                "score": a.score,
                "oranges": a.oranges,
            }
            for a, username in allocs
        ]
    else:
        scores = harvest_service.compute_scores(db, rnd.start_date, rnd.end_date)
        probs = harvest_service.probabilities(scores)
        exp = harvest_service.expected(scores, rnd.total_oranges)
        names = {}
        if scores:
            names = dict(db.query(User.id, User.username).filter(User.id.in_(list(scores))).all())
        rows = [
            {
                "user_id": uid,
                "username": names.get(uid, ""),
                "uploads": s["uploads"],
                "comments": s["comments"],
                "score": s["score"],
                "probability_pct": round(probs[uid] * 100, 1),
                "expected_oranges": exp[uid],
            }
            for uid, s in sorted(scores.items(), key=lambda kv: (-kv[1]["score"], kv[0]))
        ]
    return {
        "data": {
            "round": _round_dict(rnd, len(rows)),
            "is_estimate": rnd.status != "paid",
            "rows": rows,
        }
    }


@router.post("/rounds/{round_id}/pay")
def pay_round(
    round_id: int,
    db: Session = Depends(get_db),
    _: User | None = Depends(require_admin),
) -> dict:
    # 동시 지급을 막기 위해 행을 잠그고, 지급·감사 로그를 한 번의 커밋으로 묶는다.
    rnd = db.query(HarvestRound).filter(HarvestRound.id == round_id).with_for_update().first()
    if rnd is None:
        raise api_error(404, E_HARVEST_ROUND_NOT_FOUND, "회차를 찾을 수 없습니다")
    try:
        harvest_service.finalize_round(db, rnd, commit=False)
        _log(db, "harvest_round_pay", rnd.id, f"{rnd.start_date}~{rnd.end_date} seed={rnd.seed}")
        db.commit()
    except harvest_service.RoundNotEndedError:
        db.rollback()
        raise api_error(409, E_HARVEST_ROUND_NOT_ENDED, "회차 종료일 다음 날부터 지급할 수 있습니다")
    except (ValueError, IntegrityError):
        db.rollback()
        raise api_error(409, E_HARVEST_ALREADY_PAID, "이미 지급 완료된 회차입니다")
    db.refresh(rnd)
    return {"data": _round_dict(rnd, _participant_count(db, rnd))}


@router.delete("/rounds/{round_id}")
def delete_round(
    round_id: int,
    force: bool = Query(default=False, description="paid 회차 삭제 시 필수"),
    db: Session = Depends(get_db),
    _: User | None = Depends(require_admin),
) -> dict:
    rnd = _get_round(db, round_id)
    if rnd.status == "paid" and not force:
        raise api_error(409, E_HARVEST_ROUND_PAID_DELETE, "지급 완료된 회차는 force=true 로만 삭제할 수 있습니다")
    detail = f"{rnd.start_date}~{rnd.end_date} status={rnd.status} force={force}"
    # SQLite는 FK cascade가 꺼져 있으므로 배분 행을 명시적으로 먼저 지운다(PG에서는 ON DELETE CASCADE와 중복 안전).
    db.query(HarvestAllocation).filter(HarvestAllocation.round_id == rnd.id).delete()
    db.delete(rnd)
    _log(db, "harvest_round_delete", round_id, detail)
    db.commit()
    return {"data": {"deleted": True}}
