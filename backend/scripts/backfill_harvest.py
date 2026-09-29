"""과거 수확 회차(오렌지)를 일괄 등록한다.

대상: 2026-06 주간(4), 2026-07 주간(4), 2026-08 월간(1), 2026-09 격주(2) = 11개 회차.
종료일이 오늘(KST) 이상인 회차는 open으로 두고, 나머지는 finalize_round로 paid 처리한다.
seed = default_seed(end_date). 오렌지 개수만 다루며 sats는 다루지 않는다.

기본은 dry-run 이다. 실제 반영은 --apply 를 붙일 때만 하며 하나의 트랜잭션으로 쓴다.
--apply 는 --confirm-db <대상 DB 이름> 이 실제 대상과 일치해야만 동작한다.
DB는 일반 설정(DATABASE_URL 환경변수)을 따른다.

운영 절차(소유자 승인 후에만 실행):
    배포 -> 운영 DB alembic upgrade -> dry-run 확인 -> --apply --confirm-db stackhealth

    python scripts/backfill_harvest.py
    python scripts/backfill_harvest.py --today 2026-09-29
    python scripts/backfill_harvest.py --apply --confirm-db stackhealth
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date

from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

# backend/ 루트를 sys.path에 추가 (다른 scripts/*.py 와 같은 방식)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models.admin_log import AdminLog  # noqa: E402
from app.models.harvest import HarvestRound  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import harvest  # noqa: E402

# (연, 월, cadence)
TARGETS: list[tuple[int, int, str]] = [
    (2026, 6, "weekly"),
    (2026, 7, "weekly"),
    (2026, 8, "monthly"),
    (2026, 9, "biweekly"),
]


class BackfillConflict(Exception):
    """기존 회차와 (동일하지 않게) 겹쳐서 진행할 수 없을 때."""


def target_ranges() -> list[tuple[date, date]]:
    ranges: list[tuple[date, date]] = []
    for year, month, cadence in TARGETS:
        ranges.extend(harvest.month_ranges(year, month, cadence))
    return ranges


def build_plan(db: Session, today: date) -> list[dict]:
    """쓰기 없이 회차별 계획을 만든다. 겹치는 다른 회차가 있으면 BackfillConflict."""
    plan: list[dict] = []
    conflicts: list[str] = []
    for start, end in target_ranges():
        overlapping = (
            db.query(HarvestRound)
            .filter(HarvestRound.start_date <= end, HarvestRound.end_date >= start)
            .all()
        )
        identical = [r for r in overlapping if r.start_date == start and r.end_date == end]
        others = [r for r in overlapping if r not in identical]
        if others:
            conflicts.extend(
                f"{start}~{end} 와 기존 회차 #{r.id}({r.start_date}~{r.end_date}) 가 겹칩니다" for r in others
            )
            continue
        seed = harvest.default_seed(end)
        status = "open" if end >= today else "paid"
        scores = harvest.compute_scores(db, start, end)
        plan.append({
            "start": start,
            "end": end,
            "seed": seed,
            "status": status,
            "exists": bool(identical),
            "existing": identical[0] if identical else None,
            # 이미 있지만 open이고 종료일이 지났으면 apply 시 finalize 한다.
            "finalize_existing": bool(identical) and identical[0].status == "open" and status == "paid",
            "scores": scores,
            # paid 예정이면 실제 배분, open이면 기대값(참고용)
            "oranges": harvest.allocate(scores, total=harvest.TOTAL_ORANGES, seed=seed) if status == "paid"
            else harvest.expected(scores, harvest.TOTAL_ORANGES),
        })
    if conflicts:
        raise BackfillConflict("중단합니다(아무것도 쓰지 않았습니다):\n  " + "\n  ".join(conflicts))
    return plan


def _log(db: Session, rnd: HarvestRound, detail: str) -> None:
    db.add(AdminLog(action="harvest_round_backfill", target_type="harvest_round", target_id=rnd.id, detail=detail))


def apply_plan(db: Session, plan: list[dict], today: date | None = None) -> None:
    """계획을 한 트랜잭션으로 반영한다. 동일한 회차는 건너뛰되, open 상태로 종료일이 지났으면 finalize 한다."""
    today = today or harvest.today_kst()
    try:
        for item in plan:
            if item["exists"]:
                if item["finalize_existing"]:
                    rnd = item["existing"]
                    harvest.finalize_round(db, rnd, commit=False, today=today)
                    _log(db, rnd, f"{rnd.start_date}~{rnd.end_date} finalized existing open round")
                continue
            rnd = HarvestRound(
                start_date=item["start"],
                end_date=item["end"],
                seed=item["seed"],
                total_oranges=harvest.TOTAL_ORANGES,
                status="open",
            )
            db.add(rnd)
            db.flush()
            if item["status"] == "paid":
                harvest.finalize_round(db, rnd, commit=False, today=today)
            _log(db, rnd, f"{rnd.start_date}~{rnd.end_date} created status={rnd.status}")
        db.commit()
    except Exception:
        db.rollback()
        raise


def render_plan(db: Session, plan: list[dict]) -> str:
    uids = {uid for item in plan for uid in item["scores"]}
    names = dict(db.query(User.id, User.username).filter(User.id.in_(uids)).all()) if uids else {}
    lines: list[str] = []
    for item in plan:
        note = "이미 open, 종료되어 apply 시 지급 완료(paid)로 finalize" if item["finalize_existing"] else "이미 존재, 건너뜀" if item["exists"] else ("지급 완료(paid)로 등록" if item["status"] == "paid" else "open으로 등록")
        lines.append(f"[{item['start']} ~ {item['end']}] seed={item['seed']} status={item['status']} ({note}) 참여자={len(item['scores'])}명")
        ranked = sorted(item["oranges"].items(), key=lambda kv: (-kv[1], kv[0]))
        label = "오렌지" if item["status"] == "paid" else "기대 오렌지"
        for uid, val in ranked:
            lines.append(f"    {names.get(uid, uid)}: {val} {label}")
        if item["status"] == "paid" and item["scores"]:
            total = sum(item["oranges"].values())
            flag = "" if total == harvest.TOTAL_ORANGES else "  <-- 1008 아님!"
            lines.append(f"    합계: {total}{flag}")
        elif item["status"] == "paid":
            lines.append("    (참여자 없음: 배분 없음)")
    return "\n".join(lines)


def describe_target() -> str:
    url = make_url(settings.database_url)
    return f"{url.get_backend_name()} host={url.host or '-'} db={url.database} (password masked)"


def main() -> None:
    parser = argparse.ArgumentParser(description="과거 수확 회차 일괄 등록")
    parser.add_argument("--apply", action="store_true", help="실제로 쓴다(기본은 dry-run)")
    parser.add_argument("--confirm-db", default=None, help="--apply 시 필수: 대상 DB 이름과 일치해야 한다")
    parser.add_argument("--today", type=date.fromisoformat, default=None, help="기준일 YYYY-MM-DD (기본: 오늘 KST)")
    args = parser.parse_args()
    today = args.today or harvest.today_kst()

    print(f"대상 DB: {describe_target()}")
    if args.apply and args.confirm_db != make_url(settings.database_url).database:
        print("--apply 는 --confirm-db <대상 DB 이름> 이 실제 대상과 일치해야 합니다. 아무것도 쓰지 않았습니다.")
        sys.exit(2)
    print(f"모드: {'APPLY' if args.apply else 'DRY-RUN'}, 기준일(KST): {today}")
    db = SessionLocal()
    try:
        try:
            plan = build_plan(db, today)
        except BackfillConflict as exc:
            print(exc)
            sys.exit(1)
        print(render_plan(db, plan))
        new = [p for p in plan if not p["exists"]]
        finalizing = sum(p["finalize_existing"] for p in plan)
        print(f"\n회차 {len(plan)}개 중 신규 {len(new)}개 (paid {sum(p['status'] == 'paid' for p in new)}, open {sum(p['status'] == 'open' for p in new)}), 기존 open 회차 finalize {finalizing}개")
        if args.apply:
            apply_plan(db, plan, today)
            print("반영 완료")
        else:
            print("dry-run: 아무것도 쓰지 않았습니다. 반영하려면 --apply")
    finally:
        db.close()


if __name__ == "__main__":
    main()
