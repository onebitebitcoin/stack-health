#!/bin/bash
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "[deploy] git pull origin main..."
git pull origin main

echo "[deploy] backend 의존성 설치..."
backend/.venv/bin/pip install --quiet -r backend/requirements.txt

echo "[deploy] frontend 빌드..."
cd frontend && npm ci --silent && npm run build
cd "$APP_DIR"

echo "[deploy] worker 의존성 설치..."
worker/.venv/bin/pip install --quiet -r worker/requirements.txt

echo "[deploy] DB 마이그레이션..."
cd backend && .venv/bin/alembic upgrade head
cd "$APP_DIR"

echo "[deploy] 서비스 재시작..."
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
systemctl --user restart stack-health-app stack-health-worker

sleep 3

echo "[deploy] 헬스체크..."
APP_OK=true
WORKER_OK=true
systemctl --user is-active --quiet stack-health-app  || APP_OK=false
systemctl --user is-active --quiet stack-health-worker || WORKER_OK=false

if $APP_OK && $WORKER_OK; then
    echo "[deploy] 배포 성공 (app=active, worker=active)"
    exit 0
else
    echo "[deploy] 서비스 이상 (app=$APP_OK, worker=$WORKER_OK)"
    systemctl --user status stack-health-app --no-pager 2>&1 || true
    systemctl --user status stack-health-worker --no-pager 2>&1 || true
    exit 1
fi
