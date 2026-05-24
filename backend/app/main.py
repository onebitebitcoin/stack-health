from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.routes import auth, videos, feed, rewards, admin, comments, history

app = FastAPI(title="운동하고 비트코인 받자", version="0.1.0")
app.router.redirect_slashes = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(videos.router)
app.include_router(feed.router)
app.include_router(rewards.router)
app.include_router(admin.router)
app.include_router(comments.router)
app.include_router(history.router)


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
        return FileResponse(
            str(_static_dir / "index.html"),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
