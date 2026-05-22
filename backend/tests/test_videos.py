from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


def _register_and_token(client: TestClient, email: str = "u@x.com", username: str = "user") -> str:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "pw"})
    return res.json()["data"]["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@patch("app.routes.videos.r2_service.generate_presigned_url", return_value=("https://r2.example.com/upload", "videos/test.mp4"))
def test_presigned_url_success(mock_r2, client: TestClient) -> None:
    token = _register_and_token(client)
    res = client.post("/api/v1/videos/presigned-url", json={
        "filename": "workout.mp4",
        "content_type": "video/mp4",
        "file_size": 1024 * 1024,
        "file_hash": "abc123",
    }, headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert "upload_url" in data
    assert data["r2_key"] == "videos/test.mp4"


@patch("app.routes.videos.r2_service.generate_presigned_url", return_value=("https://r2.example.com/upload", "videos/test.mp4"))
def test_presigned_url_duplicate_hash(mock_r2, client: TestClient) -> None:
    token = _register_and_token(client)
    headers = _auth(token)
    payload = {
        "filename": "w.mp4", "content_type": "video/mp4",
        "file_size": 1024, "file_hash": "duphash",
    }
    # First request succeeds (presigned URL issued)
    client.post("/api/v1/videos/presigned-url", json=payload, headers=headers)
    # Confirm to register the hash in DB
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn.example.com/videos/test.mp4"):
        client.post("/api/v1/videos/confirm", json={
            "r2_key": "videos/test.mp4", "file_hash": "duphash", "duration_sec": 30,
        }, headers=headers)
    # Second presigned-url with same hash → 409
    res = client.post("/api/v1/videos/presigned-url", json=payload, headers=headers)
    assert res.status_code == 409


@patch("app.routes.videos.r2_service.generate_presigned_url", return_value=("https://r2.example.com/upload", "videos/x.mp4"))
def test_presigned_url_daily_limit(mock_r2, client: TestClient) -> None:
    token = _register_and_token(client)
    headers = _auth(token)
    # Exhaust 5 uploads by confirming each
    for i in range(5):
        client.post("/api/v1/videos/presigned-url", json={
            "filename": f"w{i}.mp4", "content_type": "video/mp4",
            "file_size": 100, "file_hash": f"hash{i}",
        }, headers=headers)
        with patch("app.routes.videos.r2_service.get_cdn_url", return_value=f"https://cdn/v{i}.mp4"):
            client.post("/api/v1/videos/confirm", json={
                "r2_key": f"videos/v{i}.mp4", "duration_sec": 20,
            }, headers=headers)
    # 6th → 429
    res = client.post("/api/v1/videos/presigned-url", json={
        "filename": "w6.mp4", "content_type": "video/mp4",
        "file_size": 100, "file_hash": "hash6",
    }, headers=headers)
    assert res.status_code == 429


def test_presigned_url_file_too_large(client: TestClient) -> None:
    token = _register_and_token(client)
    res = client.post("/api/v1/videos/presigned-url", json={
        "filename": "big.mp4", "content_type": "video/mp4",
        "file_size": 201 * 1024 * 1024,
        "file_hash": "bighash",
    }, headers=_auth(token))
    assert res.status_code == 400


@patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn.example.com/v.mp4")
def test_confirm_duration_too_short(mock_cdn, client: TestClient) -> None:
    token = _register_and_token(client)
    res = client.post("/api/v1/videos/confirm", json={
        "r2_key": "videos/x.mp4", "duration_sec": 5,
    }, headers=_auth(token))
    assert res.status_code == 400


@patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn.example.com/v.mp4")
def test_confirm_duration_too_long(mock_cdn, client: TestClient) -> None:
    token = _register_and_token(client)
    res = client.post("/api/v1/videos/confirm", json={
        "r2_key": "videos/x.mp4", "duration_sec": 61,
    }, headers=_auth(token))
    assert res.status_code == 400


@patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn.example.com/v.mp4")
def test_confirm_success_earns_points(mock_cdn, client: TestClient) -> None:
    token = _register_and_token(client)
    res = client.post("/api/v1/videos/confirm", json={
        "r2_key": "videos/ok.mp4",
        "duration_sec": 30,
        "caption": "great workout",
        "tags": ["홈트"],
    }, headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["points_earned"] == 50
    assert data["post"]["user_id"] is not None
