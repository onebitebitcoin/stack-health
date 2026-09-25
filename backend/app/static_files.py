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
