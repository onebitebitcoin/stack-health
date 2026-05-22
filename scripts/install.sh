#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== bitcoin_workout install.sh ==="

# --- Backend ---
echo "[Backend] Python 가상환경 셋업..."
cd "$PROJECT_ROOT/backend"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  echo "  .venv 생성 완료"
fi
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
echo "[Backend] 의존성 설치 완료"
deactivate

# --- Frontend ---
echo "[Frontend] npm install..."
cd "$PROJECT_ROOT/frontend"
if [ -f "package.json" ]; then
  npm install --silent
  echo "[Frontend] 의존성 설치 완료"
else
  echo "[Frontend] package.json 없음 — skip"
fi

# --- .env 확인 ---
cd "$PROJECT_ROOT"
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "[!] .env 파일 생성됨 — R2 키 등 실제 값으로 교체 필요"
fi

echo "=== 설치 완료 ==="
