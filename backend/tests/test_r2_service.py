from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services.r2 import (
    ALLOWED_CONTENT_TYPES,
    MAX_FILE_SIZE,
    delete_object,
    generate_presigned_url,
    get_cdn_url,
    get_r2_client,
)


def test_allowed_content_types_set() -> None:
    assert "video/mp4" in ALLOWED_CONTENT_TYPES
    assert "video/quicktime" in ALLOWED_CONTENT_TYPES
    assert "video/webm" in ALLOWED_CONTENT_TYPES


def test_max_file_size() -> None:
    assert MAX_FILE_SIZE == 200 * 1024 * 1024


def test_get_cdn_url_basic() -> None:
    url = get_cdn_url("videos/test.mp4")
    assert url.endswith("videos/test.mp4")
    assert url.startswith("https://")


def test_get_cdn_url_strips_trailing_slash() -> None:
    url = get_cdn_url("videos/abc.mp4")
    assert "//" not in url.split("://")[1]


def test_generate_presigned_url_returns_key_with_uuid() -> None:
    mock_s3 = MagicMock()
    mock_s3.generate_presigned_url.return_value = "https://r2.example.com/presigned"

    with patch("app.services.r2.get_r2_client", return_value=mock_s3):
        upload_url, r2_key = generate_presigned_url("video/mp4", "workout.mp4")

    assert upload_url == "https://r2.example.com/presigned"
    assert r2_key.startswith("videos/")
    assert r2_key.endswith(".mp4")
    mock_s3.generate_presigned_url.assert_called_once()


def test_generate_presigned_url_no_extension() -> None:
    mock_s3 = MagicMock()
    mock_s3.generate_presigned_url.return_value = "https://r2.example.com/presigned"

    with patch("app.services.r2.get_r2_client", return_value=mock_s3):
        _, r2_key = generate_presigned_url("video/mp4", "noextension")

    assert r2_key.endswith(".mp4")


def test_delete_object_calls_s3() -> None:
    mock_s3 = MagicMock()
    mock_s3.delete_object.return_value = {}

    with patch("app.services.r2.get_r2_client", return_value=mock_s3):
        delete_object("videos/test.mp4")

    mock_s3.delete_object.assert_called_once()
    call_kwargs = mock_s3.delete_object.call_args[1]
    assert call_kwargs["Key"] == "videos/test.mp4"


def test_get_r2_client_returns_boto3_client() -> None:
    mock_boto3_client = MagicMock()
    with patch("boto3.client", return_value=mock_boto3_client):
        result = get_r2_client()
    assert result is mock_boto3_client
