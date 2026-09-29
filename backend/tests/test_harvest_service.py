from __future__ import annotations

import random
from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.harvest import HarvestAllocation, HarvestRound
from app.models.post import Post
from app.models.user import User
from app.models.video import Video
from app.services import harvest
from app.services.harvest import RoundNotEndedError
from app.services.timeframe import SERVICE_TZ


def _user(db: Session, name: str, *, is_admin: bool = False) -> User:
    user = User(username=name, email=f"{name}@example.com", is_admin=is_admin)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _post(db: Session, user_id: int, created_at: datetime) -> Post:
    video = Video(
        user_id=user_id,
        r2_key=f"videos/{user_id}/{uuid4().hex}.mp4",
        cdn_url="https://cdn/seed.mp4",
        file_hash=uuid4().hex,
        duration_sec=20,
        status="active",
        created_at=created_at,
    )
    db.add(video)
    db.flush()
    post = Post(
        video_id=video.id,
        user_id=user_id,
        share_token=f"seed-{uuid4().hex[:14]}",
        created_at=created_at,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def _comment(db: Session, user_id: int, post_id: int, created_at: datetime) -> Comment:
    comment = Comment(user_id=user_id, post_id=post_id, content="hi", created_at=created_at)
    db.add(comment)
    db.commit()
    return comment


def _kst(y, m, d, hh=12, mm=0) -> datetime:
    # sqlite는 tz를 버리고 벽시계 값만 저장하므로 UTC로 변환해 넣는다(운영 PG의 timestamptz와 동일한 의미).
    return datetime(y, m, d, hh, mm, tzinfo=SERVICE_TZ).astimezone(timezone.utc)


# ---- month_ranges ----

def test_month_ranges_monthly():
    assert harvest.month_ranges(2026, 9, "monthly") == [(date(2026, 9, 1), date(2026, 9, 30))]


def test_month_ranges_biweekly_2026_09():
    assert harvest.month_ranges(2026, 9, "biweekly") == [
        (date(2026, 9, 1), date(2026, 9, 13)),
        (date(2026, 9, 14), date(2026, 9, 30)),
    ]


def test_month_ranges_weekly_2026_06():
    assert harvest.month_ranges(2026, 6, "weekly") == [
        (date(2026, 6, 1), date(2026, 6, 7)),
        (date(2026, 6, 8), date(2026, 6, 14)),
        (date(2026, 6, 15), date(2026, 6, 21)),
        (date(2026, 6, 22), date(2026, 6, 30)),
    ]


def test_month_ranges_weekly_2026_07():
    assert harvest.month_ranges(2026, 7, "weekly") == [
        (date(2026, 7, 1), date(2026, 7, 5)),
        (date(2026, 7, 6), date(2026, 7, 12)),
        (date(2026, 7, 13), date(2026, 7, 19)),
        (date(2026, 7, 20), date(2026, 7, 31)),
    ]


def test_month_ranges_weekly_2026_08_leading_partial_week_stays():
    assert harvest.month_ranges(2026, 8, "weekly") == [
        (date(2026, 8, 1), date(2026, 8, 2)),
        (date(2026, 8, 3), date(2026, 8, 9)),
        (date(2026, 8, 10), date(2026, 8, 16)),
        (date(2026, 8, 17), date(2026, 8, 23)),
        (date(2026, 8, 24), date(2026, 8, 31)),
    ]


def test_month_ranges_unknown_cadence():
    with pytest.raises(ValueError):
        harvest.month_ranges(2026, 9, "daily")


# ---- validate_round_range ----

def test_validate_round_range_ok():
    harvest.validate_round_range(date(2026, 9, 1), date(2026, 9, 1))


def test_validate_round_range_start_after_end():
    with pytest.raises(ValueError):
        harvest.validate_round_range(date(2026, 9, 5), date(2026, 9, 4))


def test_validate_round_range_cross_month():
    with pytest.raises(ValueError):
        harvest.validate_round_range(date(2026, 9, 28), date(2026, 10, 2))


# ---- compute_scores ----

def test_compute_scores_counts_and_excludes_admin(db: Session):
    a = _user(db, "alice")
    admin = _user(db, "root", is_admin=True)
    idle = _user(db, "idle")
    p1 = _post(db, a.id, _kst(2026, 9, 10))
    _post(db, a.id, _kst(2026, 9, 11))
    _comment(db, a.id, p1.id, _kst(2026, 9, 12))
    _post(db, admin.id, _kst(2026, 9, 10))

    scores = harvest.compute_scores(db, date(2026, 9, 1), date(2026, 9, 13))

    assert set(scores) == {a.id}
    assert idle.id not in scores
    assert scores[a.id]["uploads"] == 2
    assert scores[a.id]["comments"] == 1
    assert scores[a.id]["score"] == pytest.approx(1.01)


def test_compute_scores_kst_boundary(db: Session):
    a = _user(db, "alice")
    b = _user(db, "bob")
    _post(db, a.id, _kst(2026, 9, 13, 23, 30))
    _post(db, b.id, _kst(2026, 9, 14, 0, 10))

    first = harvest.compute_scores(db, date(2026, 9, 1), date(2026, 9, 13))
    second = harvest.compute_scores(db, date(2026, 9, 14), date(2026, 9, 30))

    assert set(first) == {a.id}
    assert set(second) == {b.id}


def test_compute_scores_start_boundary_inclusive(db: Session):
    a = _user(db, "alice")
    _post(db, a.id, _kst(2026, 9, 1, 0, 0))
    _post(db, a.id, _kst(2026, 8, 31, 23, 59))

    scores = harvest.compute_scores(db, date(2026, 9, 1), date(2026, 9, 30))

    assert scores[a.id]["uploads"] == 1


# ---- probabilities / allocate / expected ----

SCORES = {
    1: {"uploads": 4, "comments": 0, "score": 2.0},
    2: {"uploads": 1, "comments": 0, "score": 0.5},
    3: {"uploads": 0, "comments": 10, "score": 0.1},
}


def test_probabilities_sum_to_one_and_formula():
    probs = harvest.probabilities(SCORES)
    total = 2.6
    assert sum(probs.values()) == pytest.approx(1.0)
    assert probs[1] == pytest.approx(0.8 * 2.0 / total + 0.2 / 3)


def test_probabilities_empty():
    assert harvest.probabilities({}) == {}


def test_allocate_sums_to_total():
    wins = harvest.allocate(SCORES, total=1008, seed=20260913)
    assert sum(wins.values()) == 1008
    assert set(wins) == {1, 2, 3}


def test_allocate_same_seed_identical():
    assert harvest.allocate(SCORES, seed=7) == harvest.allocate(SCORES, seed=7)


def test_allocate_matches_legacy_global_random():
    probs = harvest.probabilities(SCORES)
    uids = sorted(SCORES)
    weights = [probs[u] for u in uids]
    random.seed(20260913)
    legacy = {u: 0 for u in uids}
    for _ in range(1008):
        legacy[random.choices(uids, weights=weights, k=1)[0]] += 1

    assert harvest.allocate(SCORES, total=1008, seed=20260913) == legacy


def test_allocate_does_not_touch_global_state():
    random.seed(123)
    expected_next = random.random()
    random.seed(123)
    harvest.allocate(SCORES, seed=1)
    assert random.random() == expected_next


def test_allocate_empty():
    assert harvest.allocate({}, seed=1) == {}


def test_expected_rounded_one_decimal():
    exp = harvest.expected(SCORES, total=1008)
    probs = harvest.probabilities(SCORES)
    assert exp[1] == round(probs[1] * 1008, 1)
    assert sum(exp.values()) == pytest.approx(1008, abs=0.2)


# ---- fruit_count / default_seed ----

@pytest.mark.parametrize(
    "pct,expected",
    [
        (0, 0), (-1, 0), (0.1, 1), (2.99, 1), (3, 2), (5.99, 2), (6, 3), (8.99, 3),
        (9, 4), (11.99, 4), (12, 5), (15.99, 5), (16, 6), (19.99, 6), (20, 7), (100, 7),
    ],
)
def test_fruit_count_thresholds(pct, expected):
    assert harvest.fruit_count(pct) == expected


def test_default_seed():
    assert harvest.default_seed(date(2026, 9, 13)) == 20260913


# ---- finalize_round ----

@pytest.fixture(autouse=True)
def _frozen_today(monkeypatch):
    """지급은 종료일 다음 날부터 가능하므로 기준일을 2026-10-01로 고정한다."""
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 1))


def _round(db: Session, start: date, end: date) -> HarvestRound:
    rnd = HarvestRound(start_date=start, end_date=end, seed=harvest.default_seed(end))
    db.add(rnd)
    db.commit()
    db.refresh(rnd)
    return rnd


def test_finalize_round_stores_allocations_and_marks_paid(db: Session):
    a = _user(db, "alice")
    b = _user(db, "bob")
    _post(db, a.id, _kst(2026, 9, 3))
    _post(db, b.id, _kst(2026, 9, 4))
    rnd = _round(db, date(2026, 9, 1), date(2026, 9, 13))

    result = harvest.finalize_round(db, rnd)

    assert result.status == "paid"
    assert result.paid_at is not None
    rows = db.query(HarvestAllocation).filter_by(round_id=rnd.id).all()
    assert {r.user_id for r in rows} == {a.id, b.id}
    assert sum(r.oranges for r in rows) == 1008
    assert all(r.uploads == 1 and r.score == pytest.approx(0.5) for r in rows)


def test_finalize_round_twice_raises(db: Session):
    a = _user(db, "alice")
    _post(db, a.id, _kst(2026, 9, 3))
    rnd = _round(db, date(2026, 9, 1), date(2026, 9, 13))
    harvest.finalize_round(db, rnd)

    with pytest.raises(ValueError):
        harvest.finalize_round(db, rnd)


def test_finalize_before_end_raises(db: Session):
    rnd = _round(db, date(2026, 9, 1), date(2026, 9, 13))
    with pytest.raises(RoundNotEndedError):
        harvest.finalize_round(db, rnd, today=date(2026, 9, 13))
    assert rnd.status == "open"
    assert harvest.finalize_round(db, rnd, today=date(2026, 9, 14)).status == "paid"


def test_compute_scores_excludes_rejected_video_keeps_private(db: Session):
    a = _user(db, "alice")
    ok = _post(db, a.id, _kst(2026, 9, 3))
    private = _post(db, a.id, _kst(2026, 9, 4))
    private.visibility = "private"
    rejected = _post(db, a.id, _kst(2026, 9, 5))
    db.get(Video, rejected.video_id).status = "rejected"
    db.commit()

    scores = harvest.compute_scores(db, date(2026, 9, 1), date(2026, 9, 13))

    assert ok and scores[a.id]["uploads"] == 2
