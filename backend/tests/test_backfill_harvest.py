from __future__ import annotations

import importlib.util
import pathlib
from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.models.harvest import HarvestAllocation, HarvestRound
from app.models.post import Post
from app.models.user import User
from app.models.video import Video

_path = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "backfill_harvest.py"
_spec = importlib.util.spec_from_file_location("backfill_harvest", _path)
backfill = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(backfill)

TODAY = date(2026, 9, 29)


def _user_with_posts(db: Session, name: str, whens: list[datetime]) -> User:
    user = User(username=name, email=f"{name}@example.com")
    db.add(user)
    db.commit()
    for when in whens:
        video = Video(
            user_id=user.id, r2_key=f"videos/{user.id}/{uuid4().hex}.mp4", cdn_url="https://cdn/x.mp4",
            file_hash=uuid4().hex, duration_sec=20, status="active", created_at=when,
        )
        db.add(video)
        db.flush()
        db.add(Post(video_id=video.id, user_id=user.id, share_token=f"s-{uuid4().hex[:14]}", created_at=when))
    db.commit()
    return user


def _seed_activity(db: Session) -> None:
    utc = lambda m, d: datetime(2026, m, d, 3, tzinfo=timezone.utc)  # noqa: E731
    _user_with_posts(db, "alice", [utc(6, 3), utc(7, 8), utc(8, 12), utc(9, 5), utc(9, 20)])
    _user_with_posts(db, "bob", [utc(6, 10), utc(7, 15), utc(8, 20), utc(9, 6)])


def test_target_ranges_is_11_rounds():
    assert len(backfill.target_ranges()) == 11


def test_dry_run_writes_nothing(db: Session):
    _seed_activity(db)

    plan = backfill.build_plan(db, TODAY)
    text = backfill.render_plan(db, plan)

    assert len(plan) == 11
    assert db.query(HarvestRound).count() == 0
    assert db.query(HarvestAllocation).count() == 0
    assert "alice" in text and "합계: 1008" in text


def test_apply_creates_11_rounds_10_paid(db: Session):
    _seed_activity(db)

    backfill.apply_plan(db, backfill.build_plan(db, TODAY))

    rounds = db.query(HarvestRound).order_by(HarvestRound.start_date).all()
    assert len(rounds) == 11
    assert sum(r.status == "paid" for r in rounds) == 10
    open_rounds = [r for r in rounds if r.status == "open"]
    assert [(r.start_date, r.end_date) for r in open_rounds] == [(date(2026, 9, 14), date(2026, 9, 30))]
    assert all(r.seed == int(r.end_date.strftime("%Y%m%d")) for r in rounds)
    for r in rounds:
        if r.status == "paid":
            total = sum(a.oranges for a in db.query(HarvestAllocation).filter_by(round_id=r.id))
            assert total in (0, 1008)  # 참여자가 없는 회차는 배분 없음
    aug = next(r for r in rounds if r.start_date == date(2026, 8, 1))
    assert sum(a.oranges for a in db.query(HarvestAllocation).filter_by(round_id=aug.id)) == 1008


def test_apply_is_idempotent(db: Session):
    _seed_activity(db)
    backfill.apply_plan(db, backfill.build_plan(db, TODAY))
    before = {(r.id, r.status) for r in db.query(HarvestRound)}
    allocs = db.query(HarvestAllocation).count()

    plan = backfill.build_plan(db, TODAY)
    backfill.apply_plan(db, plan)

    assert all(p["exists"] for p in plan)
    assert {(r.id, r.status) for r in db.query(HarvestRound)} == before
    assert db.query(HarvestAllocation).count() == allocs


def test_overlap_with_different_round_aborts_without_writes(db: Session):
    db.add(HarvestRound(start_date=date(2026, 7, 1), end_date=date(2026, 7, 31), seed=1))
    db.commit()

    with pytest.raises(backfill.BackfillConflict) as exc:
        backfill.build_plan(db, TODAY)

    assert "2026-07-01" in str(exc.value)
    assert db.query(HarvestRound).count() == 1
