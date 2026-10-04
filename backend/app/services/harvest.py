"""오렌지 스토리 수확(지급 회차) 배분 로직.

회차마다 TOTAL_ORANGES개의 오렌지를 기여 점수 + 무작위 가중 추첨으로 배분한다.
오렌지 개수만 다루며 sats는 다루지 않는다.
"""
from __future__ import annotations

import calendar
import math
import random
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.harvest import HarvestAllocation, HarvestRound, HarvestSetting
from app.models.post import Post
from app.models.user import User
from app.models.video import Video
from app.services.timeframe import SERVICE_TZ, now_local

TOTAL_ORANGES = 1008
ORANGES_PER_FRUIT = 100  # 나무 열매 1개가 뜻하는 오렌지 개수
MAX_FRUITS = 7
POINTS_PER_UPLOAD = 0.5
POINTS_PER_COMMENT = 0.01
CONTRIBUTION_WEIGHT = 0.8  # 나머지 0.2는 균등 무작위 몫
AUTO_COLLECT_DAYS = 7  # 수확 버튼이 켜져 있어도 종료 후 이 기간이 지나면 자동 수확

_CADENCES = ("weekly", "biweekly", "monthly")


class RoundNotEndedError(ValueError):
    """회차 종료일 다음 날 이전에 지급(finalize)하려 할 때."""


def today_kst() -> date:
    """오늘 날짜(KST). 테스트에서 이 함수를 패치해 기준일을 고정한다."""
    return now_local().date()


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


def _kst_bounds_utc(start: date, end: date) -> tuple[datetime, datetime]:
    """KST 날짜 구간 [start 00:00, end+1일 00:00)을 UTC datetime으로 변환한다."""
    lo = datetime(start.year, start.month, start.day, tzinfo=SERVICE_TZ).astimezone(timezone.utc)
    nxt = end + timedelta(days=1)
    hi = datetime(nxt.year, nxt.month, nxt.day, tzinfo=SERVICE_TZ).astimezone(timezone.utc)
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
        if model is Post:
            # 관리자가 반려한 영상의 게시물은 업로드로 세지 않는다(레거시 리워드도 반려/삭제 시 회수했다).
            # 비공개 게시물은 영상이 active이면 그대로 센다.
            stmt = stmt.join(Video, Video.id == Post.video_id).where(Video.status == "active")
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


def fruit_count(oranges: int) -> int:
    """그 달 수확한 오렌지 개수에 따른 나무의 열매 수 (0~7).

    화면의 큰 숫자(오렌지 개수)와 같은 기준이어야 사용자가 헷갈리지 않는다.
    열매 1개 = 오렌지 ORANGES_PER_FRUIT 개, 올림 — 1개라도 받았으면 열매가 1개는 열린다.
    """
    if oranges <= 0:
        return 0
    return min(MAX_FRUITS, math.ceil(oranges / ORANGES_PER_FRUIT))


def default_seed(end_date: date) -> int:
    """회차 종료일 기반 기본 시드 (YYYYMMDD)."""
    return int(end_date.strftime("%Y%m%d"))


def finalize_round(
    db: Session, round: HarvestRound, commit: bool = True, today: date | None = None
) -> HarvestRound:
    """회차를 확정한다: 점수 계산 -> 배분 -> 결과 저장 -> paid 처리(오렌지 확정, BTC 송금과 무관).

    commit=False면 flush만 하고 커밋은 호출자가 한다(여러 회차를 한 트랜잭션으로 묶을 때).
    종료일 다음 날부터만 지급할 수 있다(today는 테스트용, 기본은 오늘 KST)."""
    if round.status == "paid":
        raise ValueError("이미 지급 완료된 회차입니다")
    if (today or today_kst()) <= round.end_date:
        raise RoundNotEndedError("회차 종료일 다음 날부터 지급할 수 있습니다")
    scores = compute_scores(db, round.start_date, round.end_date)
    wins = allocate(scores, total=round.total_oranges, seed=round.seed)
    now = datetime.now(timezone.utc)
    # 수확 버튼이 꺼져 있으면 확정 즉시 수확된 것으로 본다.
    collected_at = None if get_collect_enabled(db) else now

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
                collected_at=collected_at,
            )
        )
    round.status = "paid"
    round.paid_at = now
    if commit:
        db.commit()
    else:
        db.flush()
    db.refresh(round)
    return round


def week_end(day: date) -> date:
    """day 가 속한 주(월~일)의 일요일."""
    return day + timedelta(days=6 - day.weekday())


def get_collect_enabled(db: Session) -> bool:
    """수확 버튼 사용 여부. 설정 행이 없으면 꺼진 것으로 본다."""
    return bool(db.query(HarvestSetting.collect_enabled).filter(HarvestSetting.id == 1).scalar())


def set_collect_enabled(db: Session, enabled: bool) -> None:
    """수확 버튼 사용 여부를 저장한다(행이 없으면 만든다). 커밋은 호출자가 한다."""
    setting = db.get(HarvestSetting, 1)
    if setting is None:
        db.add(HarvestSetting(id=1, collect_enabled=enabled))
    else:
        setting.collect_enabled = enabled
    db.flush()


def collect_all_ripe(db: Session, now: datetime | None = None, user_id: int | None = None) -> int:
    """아직 수확하지 않은 배분을 수확 처리하고 처리한 오렌지 수를 반환한다(user_id 가 없으면 전원)."""
    cond = [HarvestAllocation.collected_at.is_(None)]
    if user_id is not None:
        cond.append(HarvestAllocation.user_id == user_id)
    total = db.query(func.coalesce(func.sum(HarvestAllocation.oranges), 0)).filter(*cond).scalar()
    db.execute(
        update(HarvestAllocation).where(*cond).values(collected_at=now or datetime.now(timezone.utc)),
        execution_options={"synchronize_session": False},
    )
    return int(total)


def _create_missing_rounds(db: Session, today: date) -> None:
    """마지막 회차 다음 날부터 이번 주 일요일까지 월~일 단위 회차를 채운다."""
    last_end = db.query(func.max(HarvestRound.end_date)).scalar()
    start = last_end + timedelta(days=1) if last_end else today - timedelta(days=today.weekday())
    this_sunday = week_end(today)
    while start <= this_sunday:
        end = week_end(start)
        db.add(HarvestRound(
            start_date=start, end_date=end, seed=default_seed(end),
            total_oranges=TOTAL_ORANGES, status="open",
        ))
        start = end + timedelta(days=1)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # 동시 요청이 먼저 만들었다. 다음 호출에서 다시 확인한다.


def ensure_weekly_rounds(db: Session, today: date | None = None) -> None:
    """주간 회차를 보장한다: 빠진 회차 생성 -> 끝난 회차 확정 -> 수확 규칙 적용.

    조회 API 시작에서 호출한다. 할 일이 없으면 가벼운 쿼리 몇 번으로 끝난다."""
    today = today or today_kst()
    _create_missing_rounds(db, today)

    ended = (
        db.query(HarvestRound)
        .filter(HarvestRound.status == "open", HarvestRound.end_date < today)
        .order_by(HarvestRound.end_date)
        .with_for_update()
        .all()
    )
    for rnd in ended:
        try:
            finalize_round(db, rnd, commit=False, today=today)
        except ValueError:
            pass  # 다른 요청이 먼저 확정했다.

    if not get_collect_enabled(db):
        collect_all_ripe(db)
    else:
        # 버튼을 누르지 않아도 종료 후 일정 기간이 지나면 자동 수확한다.
        cutoff = today - timedelta(days=AUTO_COLLECT_DAYS)
        old_rounds = select(HarvestRound.id).where(HarvestRound.end_date < cutoff)
        db.execute(
            update(HarvestAllocation)
            .where(HarvestAllocation.collected_at.is_(None), HarvestAllocation.round_id.in_(old_rounds))
            .values(collected_at=datetime.now(timezone.utc)),
            execution_options={"synchronize_session": False},
        )
    db.commit()


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


def user_ripe_by_round(db: Session, user_id: int) -> dict[int, int]:
    """내가 아직 수확하지 않은 오렌지. {round_id: oranges}."""
    rows = (
        db.query(HarvestAllocation.round_id, HarvestAllocation.oranges)
        .filter(HarvestAllocation.user_id == user_id, HarvestAllocation.collected_at.is_(None))
        .all()
    )
    return {rid: oranges for rid, oranges in rows}


def user_total_collected(db: Session, user_id: int) -> int:
    """지금까지 수확한 내 오렌지 합계. 수확 대기분은 거두기 전까지 넣지 않는다."""
    total = (
        db.query(func.coalesce(func.sum(HarvestAllocation.oranges), 0))
        .filter(HarvestAllocation.user_id == user_id, HarvestAllocation.collected_at.is_not(None))
        .scalar()
    )
    return int(total)


def admin_user_rows(db: Session, rounds: list[HarvestRound]) -> list[dict]:
    """회차들에 걸친 사용자별 오렌지 현황: 자라는 중 / 익음(미수확) / 수확 완료 / 합계 / 비율(%)."""
    pool = sum(r.total_oranges for r in rounds)
    stats: dict[int, dict[str, int]] = {}

    def _entry(uid: int) -> dict[str, int]:
        return stats.setdefault(uid, {"growing": 0, "ripe": 0, "collected": 0})

    for r in rounds:
        if r.status == "paid":
            continue
        scores = compute_scores(db, r.start_date, r.end_date)
        for uid, value in expected(scores, r.total_oranges).items():
            _entry(uid)["growing"] += round(value)
    paid_ids = [r.id for r in rounds if r.status == "paid"]
    if paid_ids:
        rows = (
            db.query(HarvestAllocation.user_id, HarvestAllocation.oranges, HarvestAllocation.collected_at)
            .filter(HarvestAllocation.round_id.in_(paid_ids))
            .all()
        )
        for uid, oranges, collected_at in rows:
            _entry(uid)["collected" if collected_at else "ripe"] += oranges
    names = dict(db.query(User.id, User.username).filter(User.id.in_(list(stats))).all()) if stats else {}
    result = [
        {
            "user_id": uid,
            "username": names.get(uid, ""),
            **e,
            "total": sum(e.values()),
            "share_pct": round(sum(e.values()) / pool * 100, 1) if pool else 0.0,
        }
        for uid, e in stats.items()
    ]
    return sorted(result, key=lambda row: (-row["total"], row["user_id"]))


def summarize_rounds(rounds: list[HarvestRound], per_round: dict[int, tuple[int, bool]]) -> dict:
    """회차 목록의 내 오렌지 합계, 전체 풀, 지분(%), 열매 수."""
    my = sum(per_round[r.id][0] for r in rounds)
    pool = sum(r.total_oranges for r in rounds)
    share = round(my / pool * 100, 1) if pool else 0.0
    return {"my_oranges": my, "pool_oranges": pool, "share_pct": share, "fruit_count": fruit_count(my),
            "oranges_per_fruit": ORANGES_PER_FRUIT}
