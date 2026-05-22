# Railway 환경변수 설정 가이드

## 필수 환경변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| DATABASE_URL | PostgreSQL 연결 URL | postgresql://user:pass@host:5432/db |
| SECRET_KEY | JWT 서명 키 (랜덤 32자 이상) | openssl rand -hex 32 |
| ADMIN_SECRET_KEY | 어드민 API 인증 키 | openssl rand -hex 16 |
| R2_ACCOUNT_ID | Cloudflare 계정 ID | abc123... |
| R2_ACCESS_KEY_ID | R2 액세스 키 | ... |
| R2_SECRET_ACCESS_KEY | R2 시크릿 키 | ... |
| R2_BUCKET_NAME | R2 버킷 이름 | workout-videos |
| R2_PUBLIC_URL | R2 퍼블릭 CDN URL | https://pub-xxx.r2.dev |
| BLINK_API_KEY | Blink 계정 API 키 (선택) | blink_xxx... |

## 선택 환경변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| ENVIRONMENT | development | production으로 설정 권장 |
| PORT | 8000 | Railway 자동 주입 |
| ACCESS_TOKEN_EXPIRE_MINUTES | 10080 | JWT 만료 시간 (분) |

## 설정 방법

1. Railway 대시보드 → 프로젝트 → Variables 탭
2. 각 변수를 추가
3. BLINK_API_KEY는 선택사항 — 없으면 수동 정산 모드로 동작
