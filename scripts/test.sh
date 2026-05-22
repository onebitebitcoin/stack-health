#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

BACKEND_LINT_RESULT="SKIP"
BACKEND_TEST_RESULT="SKIP"
FRONTEND_LINT_RESULT="SKIP"

run_backend_lint() {
  echo "[Backend Lint] ruff check..."
  cd "$PROJECT_ROOT/backend"
  source .venv/bin/activate
  if python -m ruff check app/ tests/ 2>/dev/null; then
    BACKEND_LINT_RESULT="PASS"
  else
    BACKEND_LINT_RESULT="FAIL"
  fi
}

run_backend_test() {
  echo "[Backend Test] pytest..."
  cd "$PROJECT_ROOT/backend"
  source .venv/bin/activate
  if DATABASE_URL="sqlite:///./test.db" pytest tests/ -v 2>&1; then
    BACKEND_TEST_RESULT="PASS"
  else
    BACKEND_TEST_RESULT="FAIL"
  fi
  rm -f test.db
}

run_frontend_lint() {
  echo "[Frontend Lint] eslint..."
  cd "$PROJECT_ROOT/frontend"
  if npm run lint 2>/dev/null; then
    FRONTEND_LINT_RESULT="PASS"
  else
    FRONTEND_LINT_RESULT="FAIL"
  fi
}

case "$MODE" in
  lint)
    run_backend_lint
    run_frontend_lint
    ;;
  backend)
    run_backend_lint
    run_backend_test
    ;;
  frontend)
    run_frontend_lint
    ;;
  *)
    run_backend_lint
    run_backend_test
    run_frontend_lint
    ;;
esac

echo ""
echo "| 구분            | 결과 |"
echo "|-----------------|------|"
echo "| Backend Lint    | $BACKEND_LINT_RESULT |"
echo "| Backend Test    | $BACKEND_TEST_RESULT |"
echo "| Frontend Lint   | $FRONTEND_LINT_RESULT |"
