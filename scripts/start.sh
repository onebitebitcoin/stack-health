#!/bin/bash
# 백엔드 uvicorn 실행 스크립트
# systemd service 파일에서 이 스크립트를 호출하도록 설정하세요.
# ExecStart=/path/to/stack_health/scripts/start.sh blue  (또는 green)
#
# WEB_WORKERS: uvicorn 워커 수 (기본 2)
#   - workers × (pool_size=5 + max_overflow=10) = 최대 30 PostgreSQL 연결
#   - 서버 CPU 코어 수와 DB max_connections 고려해 조정

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLOT="${1:-blue}"
PORT_MAP_blue=8017
PORT_MAP_green=8018
PORT_VAR="PORT_MAP_${SLOT}"
PORT="${!PORT_VAR}"

cd "$APP_DIR/backend"

exec .venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 \
    --port "${PORT}" \
    --workers "${WEB_WORKERS:-2}" \
    --log-level info
