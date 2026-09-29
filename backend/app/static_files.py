from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

# Vite 가 만든 /assets/* 는 파일명에 콘텐츠 해시가 들어 있어 내용이 바뀌면 이름도 바뀐다.
# 그래서 브라우저·Cloudflare 가 1년 동안 재검증 없이 캐시해도 안전하다.
# 헤더가 없으면 Cloudflare 가 기본값(max-age=14400)을 붙이고 엣지 캐시가 자주 MISS 난다.
IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"


class ImmutableStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        # 404 에 immutable 을 붙이면 배포 직후 잠깐 없던 파일이 1년간 캐시될 수 있다.
        if response.status_code in (200, 304):
            response.headers["Cache-Control"] = IMMUTABLE_CACHE_CONTROL
        return response


def is_api_path(path: str) -> bool:
    """SPA fallback 이 받은 경로가 API 네임스페이스(/api/...)인지.

    없는 API 를 부르면 index.html(200) 대신 JSON 404 를 줘야 클라이언트가 원인을 알 수 있다.
    `full_path` 는 앞의 / 가 빠진 형태로 들어온다.
    """
    return path == "api" or path.startswith("api/")
