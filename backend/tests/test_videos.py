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
    # Exhaust the active upload-content limit by confirming each upload.
    for i in range(3):
        client.post("/api/v1/videos/presigned-url", json={
            "filename": f"w{i}.mp4", "content_type": "video/mp4",
            "file_size": 100, "file_hash": f"hash{i}",
        }, headers=headers)
        with patch("app.routes.videos.r2_service.get_cdn_url", return_value=f"https://cdn/v{i}.mp4"):
            client.post("/api/v1/videos/confirm", json={
                "r2_key": f"videos/v{i}.mp4", "duration_sec": 20,
            }, headers=headers)
    # Next upload is blocked while 3 active uploads remain.
    res = client.post("/api/v1/videos/presigned-url", json={
        "filename": "w3.mp4", "content_type": "video/mp4",
        "file_size": 100, "file_hash": "hash3",
    }, headers=headers)
    assert res.status_code == 429


@patch("app.routes.videos.r2_service.generate_presigned_url", return_value=("https://r2.example.com/upload", "videos/x.mp4"))
def test_presigned_url_limit_eased_after_delete(mock_r2, client: TestClient) -> None:
    token = _register_and_token(client, "limit-delete@x.com", "limitdelete")
    headers = _auth(token)
    post_ids: list[int] = []

    for i in range(3):
        client.post("/api/v1/videos/presigned-url", json={
            "filename": f"w{i}.mp4", "content_type": "video/mp4",
            "file_size": 100, "file_hash": f"delete-hash-{i}",
        }, headers=headers)
        with patch("app.routes.videos.r2_service.get_cdn_url", return_value=f"https://cdn/delete-v{i}.mp4"):
            confirm_res = client.post("/api/v1/videos/confirm", json={
                "r2_key": f"videos/delete-v{i}.mp4", "duration_sec": 20,
            }, headers=headers)
        post_ids.append(confirm_res.json()["data"]["post"]["id"])

    blocked_res = client.post("/api/v1/videos/presigned-url", json={
        "filename": "blocked.mp4", "content_type": "video/mp4",
        "file_size": 100, "file_hash": "delete-hash-blocked",
    }, headers=headers)
    assert blocked_res.status_code == 429

    with patch("app.routes.videos.r2_service.delete_object"):
        delete_res = client.delete(f"/api/v1/videos/posts/{post_ids[0]}", headers=headers)
    assert delete_res.status_code == 200

    eased_res = client.post("/api/v1/videos/presigned-url", json={
        "filename": "eased.mp4", "content_type": "video/mp4",
        "file_size": 100, "file_hash": "delete-hash-eased",
    }, headers=headers)
    assert eased_res.status_code == 200


@patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/limit.mp4")
def test_confirm_upload_uses_active_content_limit(mock_cdn, client: TestClient) -> None:
    token = _register_and_token(client, "confirm-limit@x.com", "confirmlimit")
    headers = _auth(token)

    for i in range(3):
        res = client.post("/api/v1/videos/confirm", json={
            "r2_key": f"videos/confirm-limit-{i}.mp4",
            "file_hash": f"confirm-limit-hash-{i}",
            "duration_sec": 20,
        }, headers=headers)
        assert res.status_code == 200

    res = client.post("/api/v1/videos/confirm", json={
        "r2_key": "videos/confirm-limit-blocked.mp4",
        "file_hash": "confirm-limit-hash-blocked",
        "duration_sec": 20,
    }, headers=headers)
    assert res.status_code == 429


def test_presigned_url_file_too_large(client: TestClient) -> None:
    token = _register_and_token(client)
    res = client.post("/api/v1/videos/presigned-url", json={
        "filename": "big.mp4", "content_type": "video/mp4",
        "file_size": 51 * 1024 * 1024,
        "file_hash": "bighash",
    }, headers=_auth(token))
    assert res.status_code == 400


@patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn.example.com/v.mp4")
def test_confirm_duration_too_short(mock_cdn, client: TestClient) -> None:
    token = _register_and_token(client)
    res = client.post("/api/v1/videos/confirm", json={
        "r2_key": "videos/x.mp4", "duration_sec": 4,
    }, headers=_auth(token))
    assert res.status_code == 400


@patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn.example.com/v.mp4")
def test_confirm_duration_too_long(mock_cdn, client: TestClient) -> None:
    token = _register_and_token(client)
    res = client.post("/api/v1/videos/confirm", json={
        "r2_key": "videos/x.mp4", "duration_sec": 31,
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
    # Early adopter (id <= 50) gets 2x bonus: 0.5pt * 2 = 1.0pt
    assert data["points_earned"] == 1.0
    assert data["post"]["user_id"] is not None


def test_my_posts_empty(client: TestClient) -> None:
    token = _register_and_token(client, "mp@x.com", "mpuser")
    res = client.get("/api/v1/videos/my-posts", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["data"]["posts"] == []


def test_my_posts_returns_own_posts(client: TestClient) -> None:
    token = _register_and_token(client, "mp2@x.com", "mpuser2")
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": "videos/v.mp4", "duration_sec": 20}, headers=_auth(token))
    res = client.get("/api/v1/videos/my-posts", headers=_auth(token))
    posts = res.json()["data"]["posts"]
    assert len(posts) == 1
    assert posts[0]["cdn_url"] == "https://cdn/v.mp4"


def test_my_posts_excludes_others(client: TestClient) -> None:
    token_a = _register_and_token(client, "mp3a@x.com", "mpusera")
    token_b = _register_and_token(client, "mp3b@x.com", "mpuserb")
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/b.mp4"):
        client.post("/api/v1/videos/confirm", json={"r2_key": "videos/b.mp4", "duration_sec": 20}, headers=_auth(token_b))
    res = client.get("/api/v1/videos/my-posts", headers=_auth(token_a))
    assert res.json()["data"]["posts"] == []


def test_delete_post_owner(client: TestClient) -> None:
    token = _register_and_token(client, "dp@x.com", "dpuser")
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        post_res = client.post("/api/v1/videos/confirm", json={"r2_key": "videos/del.mp4", "duration_sec": 20}, headers=_auth(token))
    post_id = post_res.json()["data"]["post"]["id"]
    with patch("app.routes.videos.r2_service.delete_object"):
        del_res = client.delete(f"/api/v1/videos/posts/{post_id}", headers=_auth(token))
    assert del_res.status_code == 200
    assert del_res.json()["data"]["deleted"] == post_id


def test_delete_post_not_found(client: TestClient) -> None:
    token = _register_and_token(client, "dp2@x.com", "dpuser2")
    res = client.delete("/api/v1/videos/posts/99999", headers=_auth(token))
    assert res.status_code == 404


def test_delete_post_forbidden(client: TestClient) -> None:
    token_owner = _register_and_token(client, "dp3a@x.com", "dpuser3a")
    token_other = _register_and_token(client, "dp3b@x.com", "dpuser3b")
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/v.mp4"):
        post_res = client.post("/api/v1/videos/confirm", json={"r2_key": "videos/own.mp4", "duration_sec": 20}, headers=_auth(token_owner))
    post_id = post_res.json()["data"]["post"]["id"]
    res = client.delete(f"/api/v1/videos/posts/{post_id}", headers=_auth(token_other))
    assert res.status_code == 403


@patch("app.services.job_queue.get_redis_client")
@patch("app.routes.videos.r2_service.get_r2_client")
def test_merge_audio_enqueues_job(mock_get_r2, mock_get_redis, client: TestClient) -> None:
    from unittest.mock import MagicMock

    token = _register_and_token(client, "ma@x.com", "mauser")

    mock_s3 = MagicMock()
    mock_s3.put_object.return_value = {}
    mock_get_r2.return_value = mock_s3

    mock_r = MagicMock()
    mock_get_redis.return_value = mock_r

    res = client.post(
        "/api/v1/videos/merge-audio",
        data={"video_r2_key": "videos/test.mp4", "audio_duration_sec": "10"},
        files={"audio": ("audio.webm", b"fake_audio_data", "audio/webm")},
        headers=_auth(token),
    )

    assert res.status_code == 200
    data = res.json()["data"]
    assert "job_id" in data
    assert data["status"] == "processing"
    mock_r.lpush.assert_called_once()


def test_merge_audio_no_redis_url(client: TestClient) -> None:
    """REDIS_URL 미설정 시 로컬 fallback 처리 → 200 반환."""
    from unittest.mock import MagicMock
    import app.services.job_queue as jq

    token = _register_and_token(client, "ma2@x.com", "mauser2")

    with patch("app.routes.videos.r2_service.get_r2_client") as mock_r2, \
         patch("app.routes.videos.enqueue_merge_job_local", return_value="fallback-job-id") as mock_local:
        mock_s3 = MagicMock()
        mock_s3.put_object.return_value = {}
        mock_r2.return_value = mock_s3

        original_url = jq.settings.redis_url
        jq.settings.redis_url = ""
        try:
            res = client.post(
                "/api/v1/videos/merge-audio",
                data={"video_r2_key": "videos/test.mp4", "audio_duration_sec": "10"},
                files={"audio": ("audio.webm", b"fake_audio_data", "audio/webm")},
                headers=_auth(token),
            )
        finally:
            jq.settings.redis_url = original_url

    assert res.status_code == 200
    data = res.json()["data"]
    assert data["job_id"] == "fallback-job-id"
    assert data["status"] == "processing"
    mock_local.assert_called_once()


@patch("app.services.job_queue.get_redis_client")
def test_get_merge_job_status_not_found(mock_get_redis, client: TestClient) -> None:
    from unittest.mock import MagicMock

    token = _register_and_token(client, "mj@x.com", "mjuser")

    mock_r = MagicMock()
    mock_r.hgetall.return_value = {}
    mock_get_redis.return_value = mock_r

    res = client.get("/api/v1/videos/merge-job/nonexistent-id", headers=_auth(token))
    assert res.status_code == 404


@patch("app.services.job_queue.get_redis_client")
def test_get_merge_job_status_pending(mock_get_redis, client: TestClient) -> None:
    from unittest.mock import MagicMock

    token = _register_and_token(client, "mj2@x.com", "mjuser2")

    mock_r = MagicMock()
    mock_r.hgetall.return_value = {
        "status": "pending",
        "user_id": "1",
        "video_r2_key": "videos/test.mp4",
        "audio_r2_key": "audio/test.webm",
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    mock_get_redis.return_value = mock_r

    job_id = "test-job-id-123"
    res = client.get(f"/api/v1/videos/merge-job/{job_id}", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["job_id"] == job_id
    assert data["status"] == "pending"


def test_merge_audio_unauthenticated(client: TestClient) -> None:
    res = client.post(
        "/api/v1/videos/merge-audio",
        data={"video_r2_key": "videos/test.mp4", "audio_duration_sec": "5"},
        files={"audio": ("audio.webm", b"data", "audio/webm")},
    )
    assert res.status_code in (401, 403)


# ──────────────────────────────────────────────
# upload-pipeline 엔드포인트 테스트
# ──────────────────────────────────────────────

@patch("app.routes.videos.enqueue_full_upload_pipeline", return_value="job-abc-123")
@patch("app.routes.videos.r2_service.upload_fileobj", return_value=("videos/test.mp4", "https://cdn/test.mp4"))
def test_upload_pipeline_success(mock_upload, mock_enqueue, client: TestClient) -> None:
    token = _register_and_token(client, "pipe@x.com", "pipeuser")
    res = client.post(
        "/api/v1/videos/upload-pipeline",
        data={"file_hash": "pipehash1", "duration_sec": "20", "tags": '["홈트"]'},
        files={"file": ("workout.mp4", b"fake-video-data", "video/mp4")},
        headers=_auth(token),
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["job_id"] == "job-abc-123"
    assert data["status"] == "processing"


@patch("app.routes.videos.enqueue_full_upload_pipeline", return_value="job-xyz")
@patch("app.routes.videos.r2_service.upload_fileobj", return_value=("videos/dupe.mp4", "https://cdn/dupe.mp4"))
def test_upload_pipeline_duplicate_hash(mock_upload, mock_enqueue, client: TestClient) -> None:
    token = _register_and_token(client, "dupepipe@x.com", "dupepipe")
    headers = _auth(token)
    # 먼저 confirm으로 해시 등록
    with patch("app.routes.videos.r2_service.get_cdn_url", return_value="https://cdn/dupe.mp4"):
        client.post("/api/v1/videos/confirm", json={
            "r2_key": "videos/dupe.mp4", "file_hash": "dupehash2", "duration_sec": 20,
        }, headers=headers)
    # 동일 해시로 pipeline 시도 → 409
    res = client.post(
        "/api/v1/videos/upload-pipeline",
        data={"file_hash": "dupehash2", "duration_sec": "20"},
        files={"file": ("w.mp4", b"data", "video/mp4")},
        headers=headers,
    )
    assert res.status_code == 409


def test_upload_pipeline_invalid_content_type(client: TestClient) -> None:
    token = _register_and_token(client, "badct@x.com", "badctuser")
    res = client.post(
        "/api/v1/videos/upload-pipeline",
        data={"file_hash": "badhash", "duration_sec": "20"},
        files={"file": ("doc.pdf", b"data", "application/pdf")},
        headers=_auth(token),
    )
    assert res.status_code == 400


def test_upload_pipeline_unauthenticated(client: TestClient) -> None:
    res = client.post(
        "/api/v1/videos/upload-pipeline",
        data={"file_hash": "h", "duration_sec": "20"},
        files={"file": ("w.mp4", b"data", "video/mp4")},
    )
    assert res.status_code in (401, 403)


@patch("app.routes.videos.get_job_status", return_value={"status": "processing"})
def test_get_upload_job_processing(mock_job, client: TestClient) -> None:
    token = _register_and_token(client, "job1@x.com", "job1user")
    res = client.get("/api/v1/videos/upload-job/some-job-id", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["status"] == "processing"
    assert data["job_id"] == "some-job-id"


@patch("app.routes.videos.get_job_status", return_value={
    "status": "completed", "post_id": "5", "cdn_url": "https://cdn/ok.mp4", "points_earned": "0.5",
})
def test_get_upload_job_completed(mock_job, client: TestClient) -> None:
    token = _register_and_token(client, "job2@x.com", "job2user")
    res = client.get("/api/v1/videos/upload-job/done-job-id", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["status"] == "completed"
    assert data["points_earned"] == 0.5
    assert data["cdn_url"] == "https://cdn/ok.mp4"


@patch("app.routes.videos.get_job_status", return_value=None)
def test_get_upload_job_not_found(mock_job, client: TestClient) -> None:
    token = _register_and_token(client, "job3@x.com", "job3user")
    res = client.get("/api/v1/videos/upload-job/nonexistent", headers=_auth(token))
    assert res.status_code == 404
