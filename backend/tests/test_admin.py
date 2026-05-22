from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

ADMIN_KEY = "test-admin-key"


def _reg(client: TestClient, email: str = "a@x.com", username: str = "au") -> str:
    res = client.post("/api/v1/auth/register", json={"email": email, "username": username, "password": "pw"})
    return res.json()["data"]["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _upload_and_claim(client: TestClient, token: str) -> int:
    for i in range(2):
        with patch("app.routes.videos.r2_service.get_cdn_url", return_value=f"https://cdn/v{i}.mp4"):
            client.post("/api/v1/videos/confirm", json={"r2_key": f"videos/v{i}.mp4", "duration_sec": 20}, headers=_auth(token))
    client.patch("/api/v1/auth/me", json={"lightning_address": "u@w.com"}, headers=_auth(token))
    res = client.post("/api/v1/rewards/claim", json={}, headers=_auth(token))
    return res.json()["data"]["claim"]["id"]


def test_admin_claims_no_key(client: TestClient) -> None:
    res = client.get("/admin/claims")
    assert res.status_code == 422  # missing header


def test_admin_claims_wrong_key(client: TestClient) -> None:
    res = client.get("/admin/claims", headers={"X-Admin-Key": "wrong"})
    assert res.status_code == 403


def test_admin_claims_list(client: TestClient) -> None:
    token = _reg(client)
    _upload_and_claim(client, token)
    res = client.get("/admin/claims", headers={"X-Admin-Key": ADMIN_KEY})
    assert res.status_code == 200
    claims = res.json()["data"]["claims"]
    assert len(claims) == 1
    assert claims[0]["status"] == "pending"


def test_admin_mark_paid(client: TestClient) -> None:
    token = _reg(client)
    claim_id = _upload_and_claim(client, token)
    res = client.patch(
        f"/admin/claims/{claim_id}/mark-paid",
        headers={"X-Admin-Key": ADMIN_KEY},
        params={"payment_memo": "sent via Zeus"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["claim"]["status"] == "paid"


def test_admin_videos_list(client: TestClient) -> None:
    token = _reg(client)
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": "videos/v.mp4", "duration_sec": 20}, headers=_auth(token))
    res = client.get("/admin/videos", headers={"X-Admin-Key": ADMIN_KEY})
    assert res.status_code == 200
    assert len(res.json()["data"]["videos"]) == 1


def test_admin_reject_video(client: TestClient) -> None:
    token = _reg(client)
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": "videos/v.mp4", "duration_sec": 20}, headers=_auth(token))
    videos = client.get("/admin/videos", headers={"X-Admin-Key": ADMIN_KEY}).json()["data"]["videos"]
    vid_id = videos[0]["id"]

    res = client.patch(f"/admin/videos/{vid_id}/reject", headers={"X-Admin-Key": ADMIN_KEY})
    assert res.status_code == 200
    assert res.json()["data"]["video"]["status"] == "rejected"
