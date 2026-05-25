import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app.routes import auth, videos, feed, rewards, admin, comments, history, challenges, users
from app.services.r2 import ensure_r2_cors

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="운동하고 비트코인 받자", version="0.1.0")
app.router.redirect_slashes = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.warning("Validation error: %s %s — %s", request.method, request.url.path, exc.errors())
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "message": "입력값이 올바르지 않습니다"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception: %s %s — %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요"},
    )


@app.middleware("http")
async def add_coop_coep_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    return response

@app.on_event("startup")
async def startup_event() -> None:
    ensure_r2_cors()


app.include_router(auth.router)
app.include_router(videos.router)
app.include_router(feed.router)
app.include_router(rewards.router)
app.include_router(admin.router)
app.include_router(comments.router)
app.include_router(history.router)
app.include_router(challenges.router)
app.include_router(users.router)


@app.get("/health")
def health() -> dict:
    try:
        version = Path(__file__).parent.parent.joinpath("VERSION").read_text().strip()
    except FileNotFoundError:
        version = "unknown"
    return {"status": "ok", "version": version}


# Serve React SPA (production: static/ dir built by Docker)
_static_dir = Path(__file__).parent.parent / "static"
if _static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_static_dir / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        file_path = _static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(
            str(_static_dir / "index.html"),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
