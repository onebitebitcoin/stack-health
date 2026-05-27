#!/bin/bash
# Blue-Green 무중단 배포 스크립트
# 사용법: ./scripts/deploy.sh
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLOT_FILE="$APP_DIR/.deploy-slot"
NGINX_UPSTREAM="$APP_DIR/nginx/upstream.conf"

export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus

# ── 현재/다음 슬롯 결정 ───────────────────────────────────────────────
CURRENT_SLOT=$(cat "$SLOT_FILE" 2>/dev/null || echo "blue")
if [ "$CURRENT_SLOT" = "blue" ]; then
    NEXT_SLOT="green"
    NEXT_PORT=8018
    CURRENT_PORT=8017
else
    NEXT_SLOT="blue"
    NEXT_PORT=8017
    CURRENT_PORT=8018
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Stack Health Blue-Green 배포             ║"
echo "╠══════════════════════════════════════════╣"
echo "║  현재: $CURRENT_SLOT (포트 $CURRENT_PORT)              ║"
echo "║  배포: $NEXT_SLOT (포트 $NEXT_PORT)               ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: 코드 업데이트 ─────────────────────────────────────────────
echo "[1/7] git pull..."
cd "$APP_DIR"
git pull --rebase origin main

# ── Step 2: 의존성 설치 ───────────────────────────────────────────────
echo "[2/7] 백엔드 의존성 설치..."
backend/.venv/bin/pip install --quiet -r backend/requirements.txt

echo "      워커 의존성 설치..."
worker/.venv/bin/pip install --quiet -r worker/requirements.txt

# ── Step 3: 프론트엔드 빌드 ───────────────────────────────────────────
echo "[3/7] 프론트엔드 빌드..."
set -a; source "$APP_DIR/.env"; set +a
cd frontend && npm ci --silent && npm run build
cd "$APP_DIR"

# ── Step 4: DB 마이그레이션 (idempotent) ─────────────────────────────
echo "[4/7] DB 마이그레이션..."
cd backend && .venv/bin/alembic upgrade head
cd "$APP_DIR"

# ── Step 5: 다음 슬롯 기동 ───────────────────────────────────────────
echo "[5/7] $NEXT_SLOT 슬롯 기동 (포트 $NEXT_PORT)..."
systemctl --user restart "stack-health-app-$NEXT_SLOT"

# ── Step 6: 헬스체크 ─────────────────────────────────────────────────
echo "[6/7] 헬스체크 대기 (최대 60초)..."
MAX_WAIT=60
INTERVAL=2
ELAPSED=0
HEALTH_STATUS=""

while [ $ELAPSED -lt $MAX_WAIT ]; do
    HEALTH_STATUS=$(curl -sf "http://127.0.0.1:$NEXT_PORT/health" 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null \
        || echo "")
    if [ "$HEALTH_STATUS" = "ok" ]; then
        echo "    ✓ 헬스체크 통과 (${ELAPSED}초)"
        break
    fi
    printf "    대기중... %d초\r" "$ELAPSED"
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

if [ "$HEALTH_STATUS" != "ok" ]; then
    echo ""
    echo "✗ 헬스체크 실패 → 롤백"
    systemctl --user stop "stack-health-app-$NEXT_SLOT" || true
    echo "  현재 슬롯($CURRENT_SLOT, 포트 $CURRENT_PORT)은 계속 운영 중"
    exit 1
fi

# ── Step 7: Nginx 전환 + 이전 슬롯 종료 ──────────────────────────────
echo "[7/7] Nginx upstream 전환 → $NEXT_SLOT (포트 $NEXT_PORT)..."
cat > "$NGINX_UPSTREAM" << EOF
upstream stackhealth_app {
    server 127.0.0.1:$NEXT_PORT;
}
EOF

sudo nginx -s reload
echo "    ✓ Nginx reload 완료 (무중단)"

# 인플라이트 요청 처리 대기 후 이전 슬롯 종료
sleep 5
echo "    이전 슬롯 종료 ($CURRENT_SLOT, 포트 $CURRENT_PORT)..."
systemctl --user stop "stack-health-app-$CURRENT_SLOT" || true

# 슬롯 파일 업데이트
echo "$NEXT_SLOT" > "$SLOT_FILE"

# 워커 재시작
echo "    워커 재시작..."
systemctl --user restart stack-health-worker

echo ""
echo "✅ 배포 완료"
echo "   활성 슬롯: $NEXT_SLOT (포트 $NEXT_PORT)"
echo "   슬롯 파일: $SLOT_FILE"
