"""오렌지 스토리 수확(지급 회차) 배분 로직.

회차마다 TOTAL_ORANGES개의 오렌지를 기여 점수 + 무작위 가중 추첨으로 배분한다.
오렌지 개수만 다루며 sats는 다루지 않는다.
"""
from __future__ import annotations

import calendar
import random
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.harvest import HarvestAllocation, HarvestRound
from app.models.post import Post
from app.models.user import User

KST = ZoneInfo("Asia/Seoul")

TOTAL_ORANGES = 1008
POINTS_PER_UPLOAD = 0.5
POINTS_PER_COMMENT = 0.01
CONTRIBUTION_WEIGHT = 0.8  # 나머지 0.2는 균등 무작위 몫

_CADENCES = ("weekly", "biweekly", "monthly")


def month_ranges(year: int, month: int, cadence: str) -> list[tuple[date, date]]:
    """월 안의 회차 (시작일, 종료일) 목록. 회차는 월을 넘지 않고 일요일에 끝나며,
    월의 마지막 회차만 말일까지 늘어난다."""
    if cadence not in _CADENCES:
        raise ValueError(f"알 수 없는 cadence: {cadence}")
    first = date(year, month, 1)
    last = date(year, month, calendar.monthrange(year, month)[1])
    if cadence == "monthly":
        return [(first, last)]

    # 월 안에 있는 일요일들 (weekday() == 6)
    sundays = [
        first + timedelta(days=i) for i in range((last - first).days + 1)
        if (first + timedelta(days=i)).weekday() == 6
    ]
    if cadence == "biweekly":
        if len(sundays) < 2:
            return [(first, last)]
        split = sundays[1]
        if split >= last:
            return [(first, last)]
        return [(first, split), (split + timedelta(days=1), last)]

    # weekly: 마지막 일요일 뒤의 짧은 꼬리 주는 직전 회차에 합친다.
    ends = list(sundays)
    if not ends or ends[-1] != last:
        if ends:
            ends[-1] = last
        else:
            ends = [last]
    ranges: list[tuple[date, date]] = []
    start = first
    for end in ends:
        ranges.append((start, end))
        start = end + timedelta(days=1)
    return ranges


def validate_round_range(start: date, end: date) -> None:
    """시작일이 종료일보다 늦거나 서로 다른 달이면 ValueError."""
    if start > end:
        raise ValueError("시작일이 종료일보다 늦습니다")
    if (start.year, start.month) != (end.year, end.month):
        raise ValueError("회차는 월을 넘을 수 없습니다")


def _kst_bounds_utc(start: date, end: date) -> tuple[datetime, datetime]:
    """KST 날짜 구간 [start 00:00, end+1일 00:00)을 UTC datetime으로 변환한다."""
    lo = datetime(start.year, start.month, start.day, tzinfo=KST).astimezone(timezone.utc)
    nxt = end + timedelta(days=1)
    hi = datetime(nxt.year, nxt.month, nxt.day, tzinfo=KST).astimezone(timezone.utc)
    return lo, hi


def compute_scores(db: Session, start: date, end: date) -> dict[int, dict]:
    """관리자를 제외한 사용자별 업로드/댓글 수와 점수. 점수가 0보다 큰 사용자만 반환한다."""
    lo, hi = _kst_bounds_utc(start, end)

    def _counts(model) -> dict[int, int]:
        stmt = (
            select(model.user_id, func.count(model.id))
            .join(User, User.id == model.user_id)
            .where(User.is_admin.is_(False), model.created_at >= lo, model.created_at < hi)
            .group_by(model.user_id)
        )
        return {uid: cnt for uid, cnt in db.execute(stmt).all()}

    uploads = _counts(Post)
    comments = _counts(Comment)
    result: dict[int, dict] = {}
    for uid in set(uploads) | set(comments):
        u, c = uploads.get(uid, 0), comments.get(uid, 0)
        score = u * POINTS_PER_UPLOAD + c * POINTS_PER_COMMENT
        if score > 0:
            result[uid] = {"uploads": u, "comments": c, "score": score}
    return result


def probabilities(scores: dict[int, dict]) -> dict[int, float]:
    """사용자별 당첨 확률 p = 0.8 * score/total + 0.2/n."""
    if not scores:
        return {}
    total = sum(s["score"] for s in scores.values())
    n = len(scores)
    return {
        uid: CONTRIBUTION_WEIGHT * s["score"] / total + (1 - CONTRIBUTION_WEIGHT) / n
        for uid, s in scores.items()
    }


def allocate(scores: dict[int, dict], total: int = TOTAL_ORANGES, seed: int = 0) -> dict[int, int]:
    """기존 리포트와 동일한 방식으로 total개를 한 개씩 가중 추첨한다.
    전역 random 상태를 건드리지 않도록 로컬 Random(seed)를 쓴다."""
    if not scores:
        return {}
    probs = probabilities(scores)
    uids = sorted(scores)
    weights = [probs[u] for u in uids]
    rng = random.Random(seed)
    wins = {u: 0 for u in uids}
    for _ in range(total):
        wins[rng.choices(uids, weights=weights, k=1)[0]] += 1
    return wins


def expected(scores: dict[int, dict], total: int = TOTAL_ORANGES) -> dict[int, float]:
    """기대 오렌지 수 (p * total, 소수 첫째 자리 반올림)."""
    return {uid: round(p * total, 1) for uid, p in probabilities(scores).items()}


def fruit_count(share_pct: float) -> int:
    """지분(%)에 따른 나무의 열매 수 (0~7)."""
    if share_pct <= 0:
        return 0
    for limit, count in ((3, 1), (6, 2), (9, 3), (12, 4), (16, 5), (20, 6)):
        if share_pct < limit:
            return count
    return 7


def default_seed(end_date: date) -> int:
    """회차 종료일 기반 기본 시드 (YYYYMMDD)."""
    return int(end_date.strftime("%Y%m%d"))


def finalize_round(db: Session, round: HarvestRound) -> HarvestRound:
    """회차를 확정한다: 점수 계산 -> 배분 -> 결과 저장 -> paid 처리."""
    if round.status == "paid":
        raise ValueError("이미 지급 완료된 회차입니다")
    scores = compute_scores(db, round.start_date, round.end_date)
    wins = allocate(scores, total=round.total_oranges, seed=round.seed)

    db.query(HarvestAllocation).filter(HarvestAllocation.round_id == round.id).delete()
    for uid, s in scores.items():
        db.add(
            HarvestAllocation(
                round_id=round.id,
                user_id=uid,
                uploads=s["uploads"],
                comments=s["comments"],
                score=s["score"],
                oranges=wins.get(uid, 0),
            )
        )
    round.status = "paid"
    round.paid_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(round)
    return round


def parse_month(month: str) -> tuple[int, int]:
    """'YYYY-MM' 문자열을 (year, month)로 변환한다. 형식이 틀리면 ValueError."""
    try:
        parsed = datetime.strptime(month, "%Y-%m")
    except (ValueError, TypeError):
        raise ValueError("month는 YYYY-MM 형식이어야 합니다")
    return parsed.year, parsed.month


def month_bounds(year: int, month: int) -> tuple[date, date]:
    """월의 첫날과 말일."""
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def find_overlap(db: Session, start: date, end: date) -> HarvestRound | None:
    """[start, end]와 기간이 겹치는 기존 회차 하나를 반환한다(없으면 None)."""
    return (
        db.query(HarvestRound)
        .filter(HarvestRound.start_date <= end, HarvestRound.end_date >= start)
        .first()
    )


def user_round_oranges(db: Session, rounds: list[HarvestRound], user_id: int) -> dict[int, tuple[int, bool]]:
    """회차별 내 오렌지 수. {round_id: (oranges, is_estimate)}.

    paid 회차는 저장된 배분값, open 회차는 기대값(반올림 정수)이다.
    open 회차의 점수 계산은 회차당 한 번만 한다.
    """
    result: dict[int, tuple[int, bool]] = {}
    paid_ids = [r.id for r in rounds if r.status == "paid"]
    stored: dict[int, int] = {}
    if paid_ids:
        rows = (
            db.query(HarvestAllocation.round_id, HarvestAllocation.oranges)
            .filter(HarvestAllocation.round_id.in_(paid_ids), HarvestAllocation.user_id == user_id)
            .all()
        )
        stored = {rid: oranges for rid, oranges in rows}
    for r in rounds:
        if r.status == "paid":
            result[r.id] = (stored.get(r.id, 0), False)
        else:
            scores = compute_scores(db, r.start_date, r.end_date)
            result[r.id] = (round(expected(scores, r.total_oranges).get(user_id, 0.0)), True)
    return result


def summarize_rounds(rounds: list[HarvestRound], per_round: dict[int, tuple[int, bool]]) -> dict:
    """회차 목록의 내 오렌지 합계, 전체 풀, 지분(%), 열매 수."""
    my = sum(per_round[r.id][0] for r in rounds)
    pool = sum(r.total_oranges for r in rounds)
    share = round(my / pool * 100, 1) if pool else 0.0
    return {"my_oranges": my, "pool_oranges": pool, "share_pct": share, "fruit_count": fruit_count(share)}
