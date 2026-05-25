# Railway 환경변수 설정 가이드

> **단일 진실 원본**: 전체 변수 목록과 의미는 `SPEC.md §2 환경변수`가 기준이다.
> 이 파일은 Railway 배포 절차 안내 용도이며, 변수 추가/변경 시 SPEC.md를 먼저 수정한다.

## 필수 환경변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| DATABASE_URL | PostgreSQL 연결 URL | postgresql://user:pass@host:5432/db |
| SECRET_KEY | JWT 서명 키 (랜덤 32자 이상) | openssl rand -hex 32 |
| ADMIN_SECRET_KEY | 어드민 초기 설정용 키 | openssl rand -hex 16 |
| R2_ACCOUNT_ID | Cloudflare 계정 ID | abc123... |
| R2_ACCESS_KEY_ID | R2 액세스 키 | ... |
| R2_SECRET_ACCESS_KEY | R2 시크릿 키 | ... |
| R2_BUCKET_NAME | R2 버킷 이름 | workout-videos |
| R2_PUBLIC_URL | R2 퍼블릭 CDN URL | https://pub-xxx.r2.dev |

## 선택 환경변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| BLINK_API_KEY | (없음) | Blink Lightning 자동결제 키. 없으면 수동 정산 모드 |
| GOOGLE_CLIENT_ID | (없음) | Google OAuth 클라이언트 ID. 없으면 Google 로그인 비활성 |
| GOOGLE_CLIENT_SECRET | (없음) | Google OAuth 시크릿 |
| REDIS_URL | (없음) | Redis 연결 URL. 없으면 ffmpeg fallback 모드 (Railway 재배포 시 잡 소실 주의) |
| APP_BASE_URL | http://localhost:8000 | LNAuth callback 등 절대 URL 생성에 사용 |
| ENVIRONMENT | development | production으로 설정 권장 |
| PORT | 8000 | Railway 자동 주입 |
| ACCESS_TOKEN_EXPIRE_MINUTES | 10080 | JWT 만료 시간 (분) |

## 설정 방법

1. Railway 대시보드 → 프로젝트 → Variables 탭
2. 각 변수를 추가
3. BLINK_API_KEY 없으면 수동 정산 모드, REDIS_URL 없으면 로컬 ffmpeg fallback 모드로 동작
