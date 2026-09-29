"""없는 /api 경로는 SPA index.html 이 아니라 JSON 404 를 돌려준다.

SPA fallback(`/{full_path:path}`)이 모든 GET 을 받아 index.html 을 주던 탓에, 없는 API 를
호출해도 200 + HTML 이 와서 클라이언트가 원인을 알기 어려웠다.
"""
import pytest
from fastapi.testclient import TestClient

from app import main
from app.static_files import is_api_path


@pytest.mark.parametrize(
    "path,expected",
    [
        ("api", True),
        ("api/", True),
        ("api/v1/users/me/tree", True),
        ("api/v1/definitely-not-a-route", True),
        ("apis", False),
        ("apple-touch-icon.png", False),
        ("profile", False),
        ("shorts/abc123", False),
        ("", False),
    ],
)
def test_is_api_path(path: str, expected: bool) -> None:
    assert is_api_path(path) is expected


spa_mounted = pytest.mark.skipif(
    not main._static_dir.exists(), reason="SPA 정적 파일이 없으면 fallback 라우트가 등록되지 않는다"
)


@spa_mounted
def test_unknown_api_get_returns_json_404(client: TestClient) -> None:
    res = client.get("/api/v1/definitely-not-a-route")
    assert res.status_code == 404
    assert res.headers["content-type"].startswith("application/json")
    assert res.json()["detail"]["code"] == "E_API_NOT_FOUND"


@spa_mounted
def test_unknown_api_head_returns_404(client: TestClient) -> None:
    res = client.head("/api/v1/definitely-not-a-route")
    assert res.status_code == 404


@spa_mounted
def test_spa_route_still_serves_index_html(client: TestClient) -> None:
    res = client.get("/profile")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/html")


def test_existing_api_route_unaffected(client: TestClient) -> None:
    assert client.get("/health").status_code == 200
