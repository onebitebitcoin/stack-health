from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


def _reg(client: TestClient, email: str = "r@x.com", username: str = "ruser") -> tuple[str, dict]:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "pw"})
    data = res.json()["data"]
    return data["access_token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _upload(client: TestClient, token: str, key: str = "videos/v.mp4") -> None:
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": key, "duration_sec": 20}, headers=_auth(token))


def test_summary_returns_week_label(client: TestClient) -> None:
    token, _ = _reg(client)
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert "week_label" in data
    assert data["week_label"].startswith("20")


def test_summary_points_after_upload(client: TestClient) -> None:
    token, _ = _reg(client)
    _upload(client, token)
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    data = res.json()["data"]
    assert data["current_week_points"] == 50
    assert data["satoshi_amount"] == 500  # 50pt = 500 sats


def test_claim_requires_minimum_sats(client: TestClient) -> None:
    token, _ = _reg(client)
    # No upload → 0 sats → below minimum
    res = client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    assert res.status_code == 400


def test_claim_success(client: TestClient) -> None:
    token, _ = _reg(client)
    # Upload twice to get 100pt = 1000 sats (minimum)
    _upload(client, token, "videos/v1.mp4")
    _upload(client, token, "videos/v2.mp4")
    # 100pt = 1000 sats

    # Set lightning address first
    client.patch("/api/v1/auth/me", json={"lightning_address": "user@walletofsatoshi.com"}, headers=_auth(token))

    res = client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    assert res.status_code == 200
    claim = res.json()["data"]["claim"]
    assert claim["status"] == "pending"
    assert claim["satoshi_amount"] == 1000


def test_claim_duplicate_same_week(client: TestClient) -> None:
    token, _ = _reg(client)
    _upload(client, token, "videos/v1.mp4")
    _upload(client, token, "videos/v2.mp4")
    client.patch("/api/v1/auth/me", json={"lightning_address": "u@w.com"}, headers=_auth(token))

    client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    res = client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    assert res.status_code == 409


def test_claim_list(client: TestClient) -> None:
    token, _ = _reg(client)
    _upload(client, token, "videos/v1.mp4")
    _upload(client, token, "videos/v2.mp4")
    client.patch("/api/v1/auth/me", json={"lightning_address": "u@w.com"}, headers=_auth(token))
    client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))

    res = client.get("/api/v1/rewards/claims", headers=_auth(token))
    assert res.status_code == 200
    assert len(res.json()["data"]["claims"]) == 1


def test_satoshi_calculation(client: TestClient) -> None:
    """100pt = 1000 sats, 50pt = 500 sats (below min claim)."""
    token, _ = _reg(client)
    _upload(client, token)  # +50pt
    res = client.get("/api/v1/rewards/summary", headers=_auth(token))
    data = res.json()["data"]
    assert data["satoshi_amount"] == 500
    assert data["claimable"] is False  # 500 < 1000 min
