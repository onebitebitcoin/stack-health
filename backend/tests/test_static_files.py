from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.static_files import IMMUTABLE_CACHE_CONTROL, ImmutableStaticFiles


def _client(tmp_path: Path) -> TestClient:
    (tmp_path / "index-abc123.js").write_text("console.log(1)")
    app = FastAPI()
    app.mount("/assets", ImmutableStaticFiles(directory=str(tmp_path)), name="assets")
    return TestClient(app)


def test_hashed_asset_is_cached_immutably(tmp_path: Path) -> None:
    # Arrange
    client = _client(tmp_path)

    # Act
    res = client.get("/assets/index-abc123.js")

    # Assert
    assert res.status_code == 200
    assert res.headers["cache-control"] == IMMUTABLE_CACHE_CONTROL


def test_not_modified_keeps_immutable_header(tmp_path: Path) -> None:
    # Arrange
    client = _client(tmp_path)
    etag = client.get("/assets/index-abc123.js").headers["etag"]

    # Act
    res = client.get("/assets/index-abc123.js", headers={"If-None-Match": etag})

    # Assert
    assert res.status_code == 304
    assert res.headers["cache-control"] == IMMUTABLE_CACHE_CONTROL


def test_missing_asset_is_not_cached(tmp_path: Path) -> None:
    # Arrange
    client = _client(tmp_path)

    # Act
    res = client.get("/assets/index-missing.js")

    # Assert
    assert res.status_code == 404
    assert "immutable" not in res.headers.get("cache-control", "")
