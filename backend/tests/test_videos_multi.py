"""다중 미디어 업로드(/upload-multi) 엔드포인트 테스트."""

from __future__ import annotations

import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from tests.test_videos import _auth, _register_and_token


def _img(name: str = "a.png") -> tuple[str, bytes, str]:
    return (name, b"fake-image-bytes", "image/png")


def _vid(name: str = "v.mp4") -> tuple[str, bytes, str]:
    return (name, b"fake-video-bytes", "video/mp4")


@patch("app.routes.videos.reserve_job_id", return_value="multi-img-1")
@patch("app.routes.videos._r2_upload_and_enqueue_multi")
def test_upload_multi_images_only_success(mock_bg, mock_reserve, client: TestClient) -> None:
    token = _register_and_token(client, "m1@x.com", "muser1")
    res = client.post(
        "/api/v1/videos/upload-multi",
        data={"items_meta": json.dumps([{"kind": "image"}, {"kind": "image"}]), "tags": '["가벼운 활동"]'},
        files=[("files", _img("a.png")), ("files", _img("b.png"))],
        headers=_auth(token),
    )
    assert res.status_code == 200, res.text
    assert res.json()["data"]["job_id"] == "multi-img-1"
    assert res.json()["data"]["status"] == "processing"


@patch("app.routes.videos.reserve_job_id", return_value="multi-mix-1")
@patch("app.routes.videos._r2_upload_and_enqueue_multi")
def test_upload_multi_image_then_video_preserves_order(mock_bg, mock_reserve, client: TestClient) -> None:
    token = _register_and_token(client, "m2@x.com", "muser2")
    res = client.post(
        "/api/v1/videos/upload-multi",
        data={"items_meta": json.dumps([{"kind": "image"}, {"kind": "video"}])},
        files=[("files", _img("first.png")), ("files", _vid("second.mp4"))],
        headers=_auth(token),
    )
    assert res.status_code == 200, res.text
    # 백그라운드로 넘어간 spooled 의 kind 순서가 전송 순서와 일치
    spooled = mock_bg.call_args.kwargs["spooled"]
    assert [item[0] for item in spooled] == ["image", "video"]


def test_upload_multi_two_videos_rejected(client: TestClient) -> None:
    token = _register_and_token(client, "m3@x.com", "muser3")
    res = client.post(
        "/api/v1/videos/upload-multi",
        data={"items_meta": json.dumps([{"kind": "video"}, {"kind": "video"}])},
        files=[("files", _vid("a.mp4")), ("files", _vid("b.mp4"))],
        headers=_auth(token),
    )
    assert res.status_code == 400


def test_upload_multi_six_images_rejected(client: TestClient) -> None:
    token = _register_and_token(client, "m4@x.com", "muser4")
    meta = [{"kind": "image"}] * 6
    files = [("files", _img(f"{i}.png")) for i in range(6)]
    res = client.post(
        "/api/v1/videos/upload-multi",
        data={"items_meta": json.dumps(meta)},
        files=files,
        headers=_auth(token),
    )
    assert res.status_code == 400


def test_upload_multi_meta_count_mismatch_rejected(client: TestClient) -> None:
    token = _register_and_token(client, "m5@x.com", "muser5")
    res = client.post(
        "/api/v1/videos/upload-multi",
        data={"items_meta": json.dumps([{"kind": "image"}])},
        files=[("files", _img("a.png")), ("files", _img("b.png"))],
        headers=_auth(token),
    )
    assert res.status_code == 400


def test_upload_multi_invalid_image_type_rejected(client: TestClient) -> None:
    token = _register_and_token(client, "m6@x.com", "muser6")
    res = client.post(
        "/api/v1/videos/upload-multi",
        data={"items_meta": json.dumps([{"kind": "image"}])},
        files=[("files", ("doc.pdf", b"data", "application/pdf"))],
        headers=_auth(token),
    )
    assert res.status_code == 400


@patch("app.routes.videos.get_daily_upload_count", return_value=99)
def test_upload_multi_daily_limit(mock_count, client: TestClient) -> None:
    token = _register_and_token(client, "m7@x.com", "muser7")
    res = client.post(
        "/api/v1/videos/upload-multi",
        data={"items_meta": json.dumps([{"kind": "image"}])},
        files=[("files", _img("a.png"))],
        headers=_auth(token),
    )
    assert res.status_code == 429


def test_upload_multi_unauthenticated(client: TestClient) -> None:
    res = client.post(
        "/api/v1/videos/upload-multi",
        data={"items_meta": json.dumps([{"kind": "image"}])},
        files=[("files", _img("a.png"))],
    )
    assert res.status_code in (401, 403)


@patch("app.routes.videos.reserve_job_id", return_value="multi-text-1")
@patch("app.routes.videos._r2_upload_and_enqueue_multi")
def test_upload_multi_with_text_subtitle(mock_bg, mock_reserve, client: TestClient) -> None:
    token = _register_and_token(client, "m8@x.com", "muser8")
    res = client.post(
        "/api/v1/videos/upload-multi",
        data={
            "items_meta": json.dumps([{"kind": "image"}]),
            "subtitle_text": "오늘 운동 완료했다",
            "tags": '["땀 흘리는 운동"]',
        },
        files=[("files", _img("a.png"))],
        headers=_auth(token),
    )
    assert res.status_code == 200, res.text
    assert mock_bg.call_args.kwargs["subtitle_text"] == "오늘 운동 완료했다"
