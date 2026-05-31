from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


def _register(client: TestClient, email: str, username: str) -> tuple[str, dict]:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "password123"})
    data = res.json()["data"]
    return data["access_token"], data["user"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_post(client: TestClient, token: str, user_id: int, filename: str = "v.mp4") -> dict:
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        res = client.post("/api/v1/videos/confirm", json={
            "r2_key": f"videos/{user_id}/{filename}", "duration_sec": 15,
        }, headers=_auth(token))
    return res.json()["data"]["post"]


def test_get_stats_unauthorized(client: TestClient) -> None:
    res = client.get("/api/v1/users/me/stats")
    assert res.status_code in (401, 403)


def test_get_stats_empty_user(client: TestClient) -> None:
    token, _ = _register(client, "stats1@x.com", "statsuser1")
    res = client.get("/api/v1/users/me/stats", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total_posts"] == 0
    assert data["total_points"] == 0


def test_get_stats_with_posts(client: TestClient) -> None:
    token, user = _register(client, "stats2@x.com", "statsuser2")
    _create_post(client, token, user["id"], "s1.mp4")
    _create_post(client, token, user["id"], "s2.mp4")

    res = client.get("/api/v1/users/me/stats", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total_posts"] == 2
    assert data["total_points"] >= 0


def test_weekly_points_unauthorized(client: TestClient) -> None:
    res = client.get("/api/v1/users/me/weekly-points")
    assert res.status_code in (401, 403)


def test_weekly_points_empty(client: TestClient) -> None:
    token, _ = _register(client, "wp1@x.com", "wpuser1")
    res = client.get("/api/v1/users/me/weekly-points", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total_points"] == 0.0
    assert data["items"] == []
    assert "week_number" in data
    assert "start_date" in data
    assert "end_date" in data


def test_weekly_points_after_upload(client: TestClient) -> None:
    token, user = _register(client, "wp2@x.com", "wpuser2")
    _create_post(client, token, user["id"], "wp.mp4")
    res = client.get("/api/v1/users/me/weekly-points", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["queued"] is True
    assert item["settles_at"] is not None
    assert item["points"] == 0.5


def test_weekly_points_invalid_timezone_falls_back(client: TestClient) -> None:
    token, _ = _register(client, "wp3@x.com", "wpuser3")
    res = client.get(
        "/api/v1/users/me/weekly-points",
        headers={**_auth(token), "x-client-timezone": "Invalid/Zone"},
    )
    assert res.status_code == 200
