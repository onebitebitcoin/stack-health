#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

run_backend() {
  echo "[Backend] 시작..."
  cd "$PROJECT_ROOT/backend"
  source .venv/bin/activate
  export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
  uvicorn app.main:app --reload --host 0.0.0.0 --port "${PORT:-8000}"
}

run_frontend() {
  echo "[Frontend] 시작..."
  cd "$PROJECT_ROOT/frontend"
  npm run dev
}

case "$MODE" in
  backend)
    run_backend
    ;;
  frontend)
    run_frontend
    ;;
  *)
    # 백엔드 백그라운드 + 프론트엔드 포그라운드
    run_backend &
    BACKEND_PID=$!
    trap "kill $BACKEND_PID 2>/dev/null" EXIT
    run_frontend
    ;;
esac
