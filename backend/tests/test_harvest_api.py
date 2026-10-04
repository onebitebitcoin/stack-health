from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.admin_log import AdminLog
from app.models.harvest import HarvestAllocation, HarvestRound
from app.models.post import Post
from app.models.user import User
from app.models.video import Video
from app.services import harvest as harvest_service
from app.services.timeframe import now_local
harvest = harvest_service

ADMIN = "/api/v1/admin/harvest"


def _register(client: TestClient, name: str) -> tuple[str, dict]:
    res = client.post(
        "/api/v1/auth/register",
        json={"email": f"{name}@x.com", "username": name, "password": "password123"},
    )
    data = res.json()["data"]
    return data["access_token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _frozen_today(monkeypatch):
    """지급은 종료일 다음 날부터 가능하므로 기준일을 2026-10-01로 고정한다."""
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 1))


def _admin(client: TestClient, db: Session) -> dict:
    token, user = _register(client, "adminuser")
    db.query(User).filter(User.id == user["id"]).update({"is_admin": True})
    db.commit()
    return _auth(token)


def _post(db: Session, user_id: int, when: datetime) -> None:
    """when(UTC)에 게시물 하나를 심는다."""
    video = Video(
        user_id=user_id,
        r2_key=f"videos/{user_id}/{uuid4().hex}.mp4",
        cdn_url="https://cdn/seed.mp4",
        file_hash=uuid4().hex,
        duration_sec=20,
        status="active",
        created_at=when,
    )
    db.add(video)
    db.flush()
    db.add(Post(video_id=video.id, user_id=user_id, share_token=f"seed-{uuid4().hex[:14]}", created_at=when))
    db.commit()


def _utc(y: int, m: int, d: int, h: int = 3) -> datetime:
    return datetime(y, m, d, h, tzinfo=timezone.utc)  # KST 정오 무렵


def _make_round(db: Session, start: date, end: date, status: str = "open") -> HarvestRound:
    rnd = HarvestRound(start_date=start, end_date=end, seed=harvest_service.default_seed(end), status=status)
    db.add(rnd)
    db.commit()
    db.refresh(rnd)
    return rnd


# ── 인증 ──────────────────────────────────────────────────────────────

def test_admin_requires_auth(client: TestClient) -> None:
    assert client.get(f"{ADMIN}/rounds").status_code == 401


def test_admin_rejects_non_admin(client: TestClient) -> None:
    token, _ = _register(client, "plainuser")
    res = client.get(f"{ADMIN}/rounds", headers=_auth(token))
    assert res.status_code == 403


# ── 생성 ──────────────────────────────────────────────────────────────

def test_create_round_defaults_seed_and_logs(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    res = client.post(f"{ADMIN}/rounds", json={"start_date": "2026-09-01", "end_date": "2026-09-13"}, headers=h)
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["status"] == "open"
    assert data["seed"] == 20260913
    assert data["total_oranges"] == 1008
    assert data["paid_at"] is None
    assert data["btc_paid_at"] is None
    assert db.query(AdminLog).filter_by(action="harvest_round_create", target_type="harvest_round").count() == 1


def test_create_round_custom_seed(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    res = client.post(
        f"{ADMIN}/rounds", json={"start_date": "2026-09-01", "end_date": "2026-09-13", "seed": 42}, headers=h
    )
    assert res.json()["data"]["seed"] == 42


def test_create_round_cross_month_allowed(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    res = client.post(f"{ADMIN}/rounds", json={"start_date": "2026-09-28", "end_date": "2026-10-02"}, headers=h)
    assert res.status_code == 201


def test_create_round_start_after_end_400(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    res = client.post(f"{ADMIN}/rounds", json={"start_date": "2026-09-10", "end_date": "2026-09-05"}, headers=h)
    assert res.status_code == 400


def test_create_round_overlap_409(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    _make_round(db, date(2026, 9, 1), date(2026, 9, 13))
    res = client.post(f"{ADMIN}/rounds", json={"start_date": "2026-09-13", "end_date": "2026-09-20"}, headers=h)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "E_HARVEST_ROUND_OVERLAP"


# ── 일괄 생성 ─────────────────────────────────────────────────────────

def test_generate_biweekly_2026_09(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    res = client.post(f"{ADMIN}/rounds/generate", json={"year": 2026, "month": 9, "cadence": "biweekly"}, headers=h)
    assert res.status_code == 201
    got = [(r["start_date"], r["end_date"]) for r in res.json()["data"]]
    assert got == [("2026-09-01", "2026-09-13"), ("2026-09-14", "2026-09-30")]
    assert db.query(AdminLog).filter_by(action="harvest_round_generate").count() == 1


def test_generate_overlap_creates_none(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    _make_round(db, date(2026, 9, 14), date(2026, 9, 30))
    res = client.post(f"{ADMIN}/rounds/generate", json={"year": 2026, "month": 9, "cadence": "biweekly"}, headers=h)
    assert res.status_code == 409
    assert db.query(HarvestRound).count() == 1


def test_generate_invalid_cadence_422(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    res = client.post(f"{ADMIN}/rounds/generate", json={"year": 2026, "month": 9, "cadence": "daily"}, headers=h)
    assert res.status_code == 422


# ── 목록 / 상세 ───────────────────────────────────────────────────────

def test_list_rounds_filter_by_month_ordered(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    _make_round(db, date(2026, 9, 14), date(2026, 9, 30))
    _make_round(db, date(2026, 9, 1), date(2026, 9, 13))
    _make_round(db, date(2026, 10, 1), date(2026, 10, 31))

    sept = client.get(f"{ADMIN}/rounds?month=2026-09", headers=h).json()["data"]
    assert [r["start_date"] for r in sept] == ["2026-09-01", "2026-09-14"]
    assert len(client.get(f"{ADMIN}/rounds", headers=h).json()["data"]) == 3
    assert client.get(f"{ADMIN}/rounds?month=2026-9x", headers=h).status_code == 400


def test_list_rounds_participant_count(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    _, u = _register(client, "worker")
    _post(db, u["id"], _utc(2026, 9, 5))
    _make_round(db, date(2026, 9, 1), date(2026, 9, 13))
    data = client.get(f"{ADMIN}/rounds?month=2026-09", headers=h).json()["data"]
    assert data[0]["participant_count"] == 1


def test_open_round_detail_preview(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    _, a = _register(client, "alice")
    _, b = _register(client, "bob")
    _post(db, a["id"], _utc(2026, 9, 5))
    _post(db, a["id"], _utc(2026, 9, 6))
    _post(db, b["id"], _utc(2026, 9, 7))
    rnd = _make_round(db, date(2026, 9, 1), date(2026, 9, 13))

    data = client.get(f"{ADMIN}/rounds/{rnd.id}", headers=h).json()["data"]

    assert data["is_estimate"] is True
    rows = {r["username"]: r for r in data["rows"]}
    assert set(rows) == {"alice", "bob"}
    assert rows["alice"]["uploads"] == 2
    assert rows["alice"]["expected_oranges"] > rows["bob"]["expected_oranges"]
    assert abs(sum(r["probability_pct"] for r in data["rows"]) - 100) < 0.2
    assert data["rows"][0]["username"] == "alice"


def test_round_detail_404(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    res = client.get(f"{ADMIN}/rounds/9999", headers=h)
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "E_HARVEST_ROUND_NOT_FOUND"


# ── 지급 / 삭제 ───────────────────────────────────────────────────────

def test_pay_round_stores_allocations(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    _, a = _register(client, "alice")
    _, b = _register(client, "bob")
    _post(db, a["id"], _utc(2026, 9, 5))
    _post(db, b["id"], _utc(2026, 9, 6))
    rnd = _make_round(db, date(2026, 9, 1), date(2026, 9, 13))

    res = client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h)

    assert res.status_code == 200
    assert res.json()["data"]["status"] == "paid"
    assert res.json()["data"]["paid_at"] is not None
    assert res.json()["data"]["btc_paid_at"] is not None
    detail = client.get(f"{ADMIN}/rounds/{rnd.id}", headers=h).json()["data"]
    assert detail["is_estimate"] is False
    assert sum(r["oranges"] for r in detail["rows"]) == 1008
    assert db.query(AdminLog).filter_by(action="harvest_round_pay").count() == 1


def test_pay_twice_409(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    _, a = _register(client, "alice")
    _post(db, a["id"], _utc(2026, 9, 5))
    rnd = _make_round(db, date(2026, 9, 1), date(2026, 9, 13))
    client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h)
    res = client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "E_HARVEST_ALREADY_PAID"


def test_delete_round_removes_allocations(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    _, a = _register(client, "alice")
    _post(db, a["id"], _utc(2026, 9, 5))
    rnd = _make_round(db, date(2026, 9, 1), date(2026, 9, 13))
    client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h)
    rid = rnd.id
    db.expire_all()

    res = client.delete(f"{ADMIN}/rounds/{rid}?force=true", headers=h)

    assert res.status_code == 200
    assert db.query(HarvestRound).count() == 0
    assert db.query(HarvestAllocation).count() == 0
    assert db.query(AdminLog).filter_by(action="harvest_round_delete").count() == 1
    assert client.delete(f"{ADMIN}/rounds/{rid}?force=true", headers=h).status_code == 404


def test_delete_open_round(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    rnd = _make_round(db, date(2026, 9, 1), date(2026, 9, 13))
    assert client.delete(f"{ADMIN}/rounds/{rnd.id}", headers=h).status_code == 200


# ── 사용자 API ────────────────────────────────────────────────────────

def test_user_harvest_requires_auth(client: TestClient) -> None:
    assert client.get("/api/v1/users/me/harvest").status_code in (401, 403)
    assert client.get("/api/v1/users/me/harvest/months").status_code in (401, 403)


def test_user_harvest_only_own_data_paid_and_open(client: TestClient, db: Session) -> None:
    token_a, a = _register(client, "alice")
    token_b, b = _register(client, "bob")
    paid = _make_round(db, date(2026, 9, 1), date(2026, 9, 13), status="paid")
    db.add(HarvestAllocation(round_id=paid.id, user_id=a["id"], uploads=3, comments=0, score=1.5, oranges=300))
    db.add(HarvestAllocation(round_id=paid.id, user_id=b["id"], uploads=1, comments=0, score=0.5, oranges=708))
    _make_round(db, date(2026, 9, 14), date(2026, 9, 30))
    db.commit()
    # open 회차: bob 혼자 활동 -> bob의 기대값은 1008, alice는 0
    _post(db, b["id"], _utc(2026, 9, 20))

    a_data = client.get("/api/v1/users/me/harvest?month=2026-09", headers=_auth(token_a)).json()["data"]
    b_data = client.get("/api/v1/users/me/harvest?month=2026-09", headers=_auth(token_b)).json()["data"]

    # 조회 시 끝난 회차(9/14~9/30)가 자동 확정된다.
    assert a_data["month"] == "2026-09"
    assert [r["status"] for r in a_data["rounds"]] == ["paid", "paid"]
    assert a_data["rounds"][0]["oranges"] == 300
    assert a_data["rounds"][0]["is_estimate"] is False
    assert a_data["rounds"][1]["oranges"] == 0
    assert a_data["rounds"][1]["is_estimate"] is False
    assert a_data["my_oranges"] == 300
    assert a_data["pool_oranges"] == 2016
    assert a_data["share_pct"] == 14.9
    assert a_data["fruit_count"] == 3
    assert a_data["oranges_per_fruit"] == 100
    assert a_data["has_estimate"] is False
    assert b_data["rounds"][0]["oranges"] == 708
    assert b_data["rounds"][1]["oranges"] == 1008
    assert b_data["my_oranges"] == 1716
    assert b_data["fruit_count"] == 7


def test_user_harvest_empty_month(client: TestClient) -> None:
    token, _ = _register(client, "alice")
    data = client.get("/api/v1/users/me/harvest?month=2026-01", headers=_auth(token)).json()["data"]
    assert data == {
        "month": "2026-01",
        "rounds": [],
        "my_oranges": 0,
        "pool_oranges": 0,
        "share_pct": 0.0,
        "fruit_count": 0,
        "oranges_per_fruit": 100,
        "has_estimate": False,
        "this_week": {"start_date": "2026-09-28", "end_date": "2026-10-04", "oranges": 0, "fruit_count": 0, "share_pct": 0.0},
        "ripe_oranges": 0,
        "total_collected": 0,
        "collect_enabled": False,
    }


def test_user_harvest_default_month_is_current_kst(client: TestClient) -> None:
    token, _ = _register(client, "alice")
    data = client.get("/api/v1/users/me/harvest", headers=_auth(token)).json()["data"]
    now = now_local()
    assert data["month"] == f"{now.year:04d}-{now.month:02d}"


def test_user_harvest_malformed_month_400(client: TestClient) -> None:
    token, _ = _register(client, "alice")
    res = client.get("/api/v1/users/me/harvest?month=2026-13", headers=_auth(token))
    assert res.status_code == 400
    assert res.json()["detail"]["code"] == "E_HARVEST_INVALID_MONTH"


def test_user_harvest_months_list(client: TestClient, db: Session) -> None:
    token, a = _register(client, "alice")
    paid = _make_round(db, date(2026, 8, 1), date(2026, 8, 31), status="paid")
    db.add(HarvestAllocation(round_id=paid.id, user_id=a["id"], uploads=1, comments=0, score=0.5, oranges=504))
    _make_round(db, date(2026, 9, 1), date(2026, 9, 13))
    _make_round(db, date(2026, 9, 14), date(2026, 9, 30))
    db.commit()

    data = client.get("/api/v1/users/me/harvest/months", headers=_auth(token)).json()["data"]

    assert data == [
        {"month": "2026-08", "my_oranges": 504, "pool_oranges": 1008, "share_pct": 50.0, "round_count": 1},
        {"month": "2026-09", "my_oranges": 0, "pool_oranges": 2016, "share_pct": 0.0, "round_count": 2},
        {"month": "2026-10", "my_oranges": 0, "pool_oranges": 1008, "share_pct": 0.0, "round_count": 1},
    ]


def test_user_harvest_months_creates_current_week(client: TestClient) -> None:
    token, _ = _register(client, "alice")
    data = client.get("/api/v1/users/me/harvest/months", headers=_auth(token)).json()["data"]
    assert data == [{"month": "2026-10", "my_oranges": 0, "pool_oranges": 1008, "share_pct": 0.0, "round_count": 1}]


# ── 리뷰 수정 ─────────────────────────────────────────────────────────

def test_pay_before_period_end_409(client: TestClient, db: Session, monkeypatch) -> None:
    h = _admin(client, db)
    rnd = _make_round(db, date(2026, 9, 14), date(2026, 9, 30))
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 9, 30))  # 종료일 당일
    res = client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "E_HARVEST_ROUND_NOT_ENDED"
    db.expire_all()
    assert db.get(HarvestRound, rnd.id).status == "open"
    assert db.query(AdminLog).filter_by(action="harvest_round_pay").count() == 0
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 1))  # 다음 날
    assert client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h).status_code == 200


def test_delete_paid_requires_force(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    rnd = _make_round(db, date(2026, 9, 1), date(2026, 9, 13))
    client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h)
    res = client.delete(f"{ADMIN}/rounds/{rnd.id}", headers=h)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "E_HARVEST_ROUND_PAID_DELETE"
    assert db.query(HarvestRound).count() == 1
    assert client.delete(f"{ADMIN}/rounds/{rnd.id}?force=true", headers=h).status_code == 200
    log = db.query(AdminLog).filter_by(action="harvest_round_delete").one()
    assert "force=True" in log.detail


def test_seed_bounds_422(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    for seed in (-1, 2**31):
        res = client.post(
            f"{ADMIN}/rounds", json={"start_date": "2026-09-01", "end_date": "2026-09-13", "seed": seed}, headers=h
        )
        assert res.status_code == 422
    res = client.post(
        f"{ADMIN}/rounds", json={"start_date": "2026-09-01", "end_date": "2026-09-13", "seed": 2**31 - 1}, headers=h
    )
    assert res.status_code == 201


def test_pay_integrity_error_maps_to_409(client: TestClient, db: Session, monkeypatch) -> None:
    from sqlalchemy.exc import IntegrityError

    h = _admin(client, db)
    rnd = _make_round(db, date(2026, 9, 1), date(2026, 9, 13))

    def boom(*a, **k):
        raise IntegrityError("x", {}, Exception("dup"))

    monkeypatch.setattr(harvest, "finalize_round", boom)
    res = client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "E_HARVEST_ALREADY_PAID"


# ── 주간 수확 / 수확 버튼 ─────────────────────────────────────────────

def test_this_week_estimate(client: TestClient, db: Session) -> None:
    token, a = _register(client, "alice")
    _post(db, a["id"], _utc(2026, 10, 1))
    data = client.get("/api/v1/users/me/harvest", headers=_auth(token)).json()["data"]
    assert data["this_week"] == {"start_date": "2026-09-28", "end_date": "2026-10-04", "oranges": 1008, "fruit_count": 7, "share_pct": 100.0}


def test_collect_off_everything_collected(client: TestClient, db: Session, monkeypatch) -> None:
    token, a = _register(client, "alice")
    _post(db, a["id"], _utc(2026, 9, 30))
    client.get("/api/v1/users/me/harvest", headers=_auth(token))  # 10/1 기준으로 9/28~10/4 회차 생성
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 5))
    data = client.get("/api/v1/users/me/harvest?month=2026-10", headers=_auth(token)).json()["data"]
    assert data["my_oranges"] == 1008
    assert data["ripe_oranges"] == 0
    assert data["collect_enabled"] is False
    assert data["rounds"][0]["collected"] is True
    res = client.post("/api/v1/users/me/harvest/collect", headers=_auth(token))
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "E_HARVEST_COLLECT_DISABLED"


def test_collect_on_ripe_then_collect_idempotent(client: TestClient, db: Session, monkeypatch) -> None:
    h = _admin(client, db)
    token, a = _register(client, "alice")
    _post(db, a["id"], _utc(2026, 9, 30))
    client.put(f"{ADMIN}/settings", json={"collect_enabled": True}, headers=h)
    client.get("/api/v1/users/me/harvest", headers=_auth(token))  # 10/1 기준으로 9/28~10/4 회차 생성
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 5))

    data = client.get("/api/v1/users/me/harvest?month=2026-10", headers=_auth(token)).json()["data"]
    assert data["ripe_oranges"] == 1008
    assert data["collect_enabled"] is True
    assert data["rounds"][0]["collected"] is False

    first = client.post("/api/v1/users/me/harvest/collect", headers=_auth(token))
    assert first.status_code == 200
    assert first.json() == {"data": {"collected": 1008}}
    assert client.post("/api/v1/users/me/harvest/collect", headers=_auth(token)).json() == {"data": {"collected": 0}}
    data = client.get("/api/v1/users/me/harvest?month=2026-10", headers=_auth(token)).json()["data"]
    assert data["ripe_oranges"] == 0
    assert data["rounds"][0]["collected"] is True


def test_total_collected_counts_only_collected_across_months(client: TestClient, db: Session, monkeypatch) -> None:
    h = _admin(client, db)
    token, a = _register(client, "alice")
    _make_round(db, date(2026, 9, 14), date(2026, 9, 20))
    _post(db, a["id"], _utc(2026, 9, 15))
    _post(db, a["id"], _utc(2026, 9, 30))
    client.get("/api/v1/users/me/harvest", headers=_auth(token))  # 9/14~20 확정·자동 수확(스위치 OFF)
    client.put(f"{ADMIN}/settings", json={"collect_enabled": True}, headers=h)
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 5))  # 9/21~27, 9/28~10/4 확정, 수확 대기

    data = client.get("/api/v1/users/me/harvest", headers=_auth(token)).json()["data"]
    assert data["total_collected"] == 1008  # 수확 대기분은 버튼을 누르기 전까지 더하지 않는다
    assert data["ripe_oranges"] == 1008

    client.post("/api/v1/users/me/harvest/collect", headers=_auth(token))
    assert client.get("/api/v1/users/me/harvest", headers=_auth(token)).json()["data"]["total_collected"] == 2016


def test_this_week_fruit_count_follows_this_week_oranges(client: TestClient, db: Session) -> None:
    token, a = _register(client, "alice")
    _post(db, a["id"], _utc(2026, 9, 30))
    week = client.get("/api/v1/users/me/harvest", headers=_auth(token)).json()["data"]["this_week"]
    assert week["oranges"] == 1008
    assert week["fruit_count"] == 7

    token_b, _ = _register(client, "bob")
    empty = client.get("/api/v1/users/me/harvest", headers=_auth(token_b)).json()["data"]["this_week"]
    assert empty["fruit_count"] == 0


def test_this_week_share_pct_with_two_users(client: TestClient, db: Session) -> None:
    token_a, a = _register(client, "alice")
    token_b, b = _register(client, "bob")
    _post(db, a["id"], _utc(2026, 9, 30))
    _post(db, a["id"], _utc(2026, 10, 1))
    _post(db, b["id"], _utc(2026, 10, 1))
    scores = harvest_service.compute_scores(db, date(2026, 9, 28), date(2026, 10, 4))
    total = sum(v["score"] for v in scores.values())
    for token, uid in ((token_a, a["id"]), (token_b, b["id"])):
        expected_pct = round((0.8 * scores[uid]["score"] / total + 0.2 / 2) * 100, 1)
        week = client.get("/api/v1/users/me/harvest", headers=_auth(token)).json()["data"]["this_week"]
        assert week["share_pct"] == expected_pct
    pcts = [
        client.get("/api/v1/users/me/harvest", headers=_auth(t)).json()["data"]["this_week"]["share_pct"]
        for t in (token_a, token_b)
    ]
    assert pcts[0] > pcts[1] and abs(sum(pcts) - 100) < 0.2


def test_collect_requires_auth(client: TestClient) -> None:
    assert client.post("/api/v1/users/me/harvest/collect").status_code in (401, 403)


def test_collect_only_own_allocations(client: TestClient, db: Session, monkeypatch) -> None:
    h = _admin(client, db)
    token_a, a = _register(client, "alice")
    token_b, b = _register(client, "bob")
    _post(db, a["id"], _utc(2026, 9, 30))
    _post(db, b["id"], _utc(2026, 9, 30))
    client.put(f"{ADMIN}/settings", json={"collect_enabled": True}, headers=h)
    client.get("/api/v1/users/me/harvest", headers=_auth(token_a))  # 10/1 기준으로 9/28~10/4 회차 생성
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 5))
    client.get("/api/v1/users/me/harvest", headers=_auth(token_a))
    client.post("/api/v1/users/me/harvest/collect", headers=_auth(token_a))
    b_data = client.get("/api/v1/users/me/harvest?month=2026-10", headers=_auth(token_b)).json()["data"]
    assert b_data["ripe_oranges"] == b_data["my_oranges"] > 0


def test_settings_off_collects_ripe_and_logs(client: TestClient, db: Session, monkeypatch) -> None:
    h = _admin(client, db)
    token, a = _register(client, "alice")
    _post(db, a["id"], _utc(2026, 9, 30))
    assert client.get(f"{ADMIN}/settings", headers=h).json() == {"data": {"collect_enabled": False}}
    client.put(f"{ADMIN}/settings", json={"collect_enabled": True}, headers=h)
    client.get("/api/v1/users/me/harvest", headers=_auth(token))  # 10/1 기준으로 9/28~10/4 회차 생성
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 5))
    assert client.get("/api/v1/users/me/harvest", headers=_auth(token)).json()["data"]["ripe_oranges"] == 1008

    res = client.put(f"{ADMIN}/settings", json={"collect_enabled": False}, headers=h)

    assert res.json() == {"data": {"collect_enabled": False}}
    assert db.query(HarvestAllocation).filter(HarvestAllocation.collected_at.is_(None)).count() == 0
    assert db.query(AdminLog).filter_by(action="harvest_settings_update").count() == 2


def test_settings_requires_admin(client: TestClient) -> None:
    token, _ = _register(client, "plainuser")
    assert client.get(f"{ADMIN}/settings", headers=_auth(token)).status_code == 403
    assert client.put(f"{ADMIN}/settings", json={"collect_enabled": True}, headers=_auth(token)).status_code == 403


def test_auto_collect_after_7_days(client: TestClient, db: Session, monkeypatch) -> None:
    h = _admin(client, db)
    token, a = _register(client, "alice")
    _post(db, a["id"], _utc(2026, 9, 30))
    client.put(f"{ADMIN}/settings", json={"collect_enabled": True}, headers=h)
    client.get("/api/v1/users/me/harvest", headers=_auth(token))  # 10/1 기준으로 9/28~10/4 회차 생성
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 11))
    assert client.get("/api/v1/users/me/harvest", headers=_auth(token)).json()["data"]["ripe_oranges"] == 1008
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 12))
    assert client.get("/api/v1/users/me/harvest", headers=_auth(token)).json()["data"]["ripe_oranges"] == 0


def test_admin_users_numbers(client: TestClient, db: Session, monkeypatch) -> None:
    h = _admin(client, db)
    token_a, a = _register(client, "alice")
    _, b = _register(client, "bob")
    _post(db, a["id"], _utc(2026, 9, 30))
    _post(db, a["id"], _utc(2026, 9, 29))
    _post(db, b["id"], _utc(2026, 9, 29))
    client.put(f"{ADMIN}/settings", json={"collect_enabled": True}, headers=h)
    client.get("/api/v1/users/me/harvest", headers=_auth(token_a))  # 10/1 기준으로 9/28~10/4 회차 생성
    monkeypatch.setattr(harvest, "today_kst", lambda: date(2026, 10, 6))  # 9/28~10/4 확정, 10/5~11 진행 중
    _post(db, b["id"], _utc(2026, 10, 6))
    client.get("/api/v1/users/me/harvest", headers=_auth(token_a))
    client.post("/api/v1/users/me/harvest/collect", headers=_auth(token_a))  # alice 수확

    res = client.get(f"{ADMIN}/users?month=2026-10", headers=h)

    rows = {r["username"]: r for r in res.json()["data"]["rows"]}
    assert res.json()["data"]["month"] == "2026-10"
    assert set(rows) == {"alice", "bob"}
    assert rows["alice"]["collected"] > 0 and rows["alice"]["ripe"] == 0
    assert rows["bob"]["ripe"] > 0 and rows["bob"]["collected"] == 0 and rows["bob"]["growing"] == 1008
    assert rows["alice"]["growing"] == 0
    for r in rows.values():
        assert r["total"] == r["growing"] + r["ripe"] + r["collected"]
    assert sum(r["ripe"] + r["collected"] for r in rows.values()) == 1008
    totals = [r["total"] for r in res.json()["data"]["rows"]]
    assert totals == sorted(totals, reverse=True)
    assert "adminuser" not in rows
    pool = res.json()["data"]["pool_oranges"]
    assert pool == 2016
    for r in rows.values():
        assert r["share_pct"] == round(r["total"] / pool * 100, 1)


def test_admin_users_default_month_and_invalid(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    assert client.get(f"{ADMIN}/users", headers=h).json()["data"] == {"month": "2026-10", "pool_oranges": 1008, "rows": []}
    assert client.get(f"{ADMIN}/users?month=bad", headers=h).status_code == 400


def test_list_rounds_creates_weekly_round_and_groups_by_end_month(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    data = client.get(f"{ADMIN}/rounds?month=2026-10", headers=h).json()["data"]
    assert [(r["start_date"], r["end_date"]) for r in data] == [("2026-09-28", "2026-10-04")]
    assert client.get(f"{ADMIN}/rounds?month=2026-09", headers=h).json()["data"] == []


def test_pay_marks_btc_paid_after_auto_finalize(client: TestClient, db: Session) -> None:
    h = _admin(client, db)
    _, a = _register(client, "alice")
    _post(db, a["id"], _utc(2026, 9, 5))
    rnd = _make_round(db, date(2026, 9, 1), date(2026, 9, 13))
    client.get(f"{ADMIN}/rounds", headers=h)  # 조회로 자동 확정
    db.expire_all()
    assert db.get(HarvestRound, rnd.id).status == "paid"
    assert db.get(HarvestRound, rnd.id).btc_paid_at is None

    first = client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h)
    assert first.status_code == 200
    assert first.json()["data"]["btc_paid_at"] is not None
    again = client.post(f"{ADMIN}/rounds/{rnd.id}/pay", headers=h)
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "E_HARVEST_ALREADY_PAID"
