# SPEC.md — 운동하고 비트코인 받자

> 버전: 0.1.0 (MVP)
> 런칭 목표: 2026-05-28
> 최종 업데이트: 2026-05-21

---

## 1. 프로젝트 개요

운동 쇼츠를 SNS 피드(인스타 릴스/유튜브 쇼츠 형태)로 공유하고, 매주 포인트를 적립해 Bitcoin(Lightning)으로 수령하는 웹 플랫폼.

### 핵심 가치
- 운동 습관 형성 + 비트코인 접근성 향상
- 진짜 BTC 지급 (자체 토큰 없음)
- 비수탁 구조 (서버가 사용자 BTC 보관하지 않음)

### MVP 목표
- 사용자: 3개월 내 100명 확보
- 수익: 광고 기반, 월 100만원 목표 (MAU 1,400명+ 필요 — 장기 목표)
- 초기 운영비: 10만원 (기확보)

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18 + Vite + TailwindCSS + shadcn/ui |
| Backend | Python 3.11 + FastAPI + SQLAlchemy 2.0 + Alembic |
| DB (개발) | SQLite |
| DB (프로덕션) | PostgreSQL (Railway 제공) |
| 영상 저장 | Cloudflare R2 (presigned URL 직접 업로드) |
| 영상 서빙 | Cloudflare CDN (R2 퍼블릭 도메인) |
| 배포 | Railway (단일 서비스: FastAPI가 React 빌드 파일도 서빙) |
| Lightning 지급 | 운영자 수동 송금 (외부 API 없음) |
| 인증 | JWT (python-jose) |
| 아이콘 | lucide-react |
| HTTP 클라이언트 | TanStack Query (React Query v5) |
| 상태 관리 | Zustand |

### 환경 변수 (.env)
```
# Database
DATABASE_URL=sqlite:///./dev.db

# JWT
SECRET_KEY=<random 32 bytes>
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=https://<bucket>.r2.dev

# Admin
ADMIN_SECRET_KEY=<random string>

# App
ENVIRONMENT=development
PORT=8000
```

---

## 3. 프로젝트 구조

```
bitcoin_workout/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── video.py
│   │   │   ├── post.py
│   │   │   ├── reward.py
│   │   │   └── claim.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── video.py
│   │   │   ├── reward.py
│   │   │   └── claim.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── videos.py
│   │   │   ├── feed.py
│   │   │   ├── rewards.py
│   │   │   └── admin.py
│   │   ├── services/
│   │   │   ├── auth.py
│   │   │   ├── r2.py
│   │   │   └── reward.py
│   │   └── middleware/
│   │       └── rate_limit.py
│   ├── alembic/
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── FeedPage.tsx
│   │   │   ├── UploadPage.tsx
│   │   │   ├── RewardsPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   └── AdminPage.tsx
│   │   ├── components/
│   │   │   ├── VideoCard.tsx
│   │   │   ├── BottomNav.tsx
│   │   │   ├── TagChip.tsx
│   │   │   ├── PointBadge.tsx
│   │   │   └── ClaimBottomSheet.tsx
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   └── store/
│   │       └── auth.ts
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   ├── install.sh
│   ├── dev.sh
│   └── test.sh
├── SPEC.md
├── PROGRESS.md  (구현 중에만 존재)
└── VERSION
```

---

## 4. 데이터베이스 스키마

### users
```sql
id              INTEGER PRIMARY KEY
email           TEXT UNIQUE NOT NULL
username        TEXT UNIQUE NOT NULL
password_hash   TEXT NOT NULL
lightning_address TEXT              -- 예: user@walletofsatoshi.com
avatar_url      TEXT
is_admin        BOOLEAN DEFAULT FALSE
created_at      DATETIME DEFAULT now()
```

### videos
```sql
id              INTEGER PRIMARY KEY
user_id         INTEGER REFERENCES users(id)
r2_key          TEXT NOT NULL          -- R2 오브젝트 키
cdn_url         TEXT NOT NULL          -- 서빙 URL
file_hash       TEXT NOT NULL          -- SHA256, 중복 업로드 차단
duration_sec    INTEGER                -- 영상 길이 (초)
status          TEXT DEFAULT 'active'  -- active | rejected
created_at      DATETIME DEFAULT now()
```

### posts
```sql
id              INTEGER PRIMARY KEY
video_id        INTEGER REFERENCES videos(id) UNIQUE
user_id         INTEGER REFERENCES users(id)
caption         TEXT                   -- 140자 이내
tags            TEXT                   -- JSON 배열: ["홈트", "러닝"]
like_count      INTEGER DEFAULT 0
view_count      INTEGER DEFAULT 0
created_at      DATETIME DEFAULT now()
```

### reward_points
```sql
id              INTEGER PRIMARY KEY
user_id         INTEGER REFERENCES users(id)
week_label      TEXT NOT NULL          -- 예: 2026-W21
points          INTEGER NOT NULL
reason          TEXT NOT NULL          -- upload | like_received | view_received
reference_id    INTEGER                -- post_id 또는 video_id
created_at      DATETIME DEFAULT now()
```

### lightning_claims
```sql
id              INTEGER PRIMARY KEY
user_id         INTEGER REFERENCES users(id)
week_label      TEXT NOT NULL
points_used     INTEGER NOT NULL
satoshi_amount  INTEGER NOT NULL
ln_address      TEXT NOT NULL          -- 지급 시점의 주소 스냅샷
status          TEXT DEFAULT 'pending' -- pending | paid | cancelled
payment_memo    TEXT                   -- 운영자 메모 (선택)
created_at      DATETIME DEFAULT now()
updated_at      DATETIME DEFAULT now()
```

---

## 5. API 명세

### 공통
- Base URL: `/api/v1`
- 인증: `Authorization: Bearer <jwt>`
- 응답 형식: `{ data, error }`
- Trailing slash 없음
- `redirect_slashes = False`

### CORS
```python
allow_origins=["*"]
allow_credentials=False
allow_methods=["*"]
allow_headers=["*"]
```

---

### Auth

#### POST `/api/v1/auth/register`
```json
Request:  { "email": str, "username": str, "password": str }
Response: { "data": { "access_token": str, "user": UserSchema } }
```

#### POST `/api/v1/auth/login`
```json
Request:  { "email": str, "password": str }
Response: { "data": { "access_token": str, "user": UserSchema } }
```

#### GET `/api/v1/auth/me` 🔒
```json
Response: { "data": UserSchema }
```

#### PATCH `/api/v1/auth/me` 🔒
```json
Request:  { "username"?: str, "lightning_address"?: str }
Response: { "data": UserSchema }
```

---

### Videos

#### POST `/api/v1/videos/presigned-url` 🔒
R2 업로드용 presigned URL 발급.
```json
Request:  { "filename": str, "content_type": str, "file_size": int, "file_hash": str }
Response: { "data": { "upload_url": str, "r2_key": str } }
```
검증:
- `content_type`: `video/mp4`, `video/quicktime`, `video/webm` 만 허용
- `file_size`: 최대 200MB
- `file_hash`: DB에서 중복 검사 → 중복이면 `409 Conflict`
- 일일 업로드 횟수: 사용자당 5회 초과 시 `429 Too Many Requests`

#### POST `/api/v1/videos/confirm` 🔒
R2 업로드 완료 후 DB 저장 + 포인트 적립.
```json
Request:  { "r2_key": str, "duration_sec": int, "caption"?: str, "tags"?: [str] }
Response: { "data": { "post": PostSchema, "points_earned": int } }
```
검증:
- `duration_sec`: 10초 이상, 60초 이하
- `tags`: `["홈트", "러닝", "요가", "웨이트", "기타"]` 중 선택 (복수 가능)
- 완료 후 포인트 적립: `+50pt` (uploads)

---

### Feed

#### GET `/api/v1/feed`
```
Query: cursor?: int, limit?: int (default 10, max 20)
Response: { "data": { "posts": [PostSchema], "next_cursor": int | null } }
```
- 최신순 정렬
- 비로그인도 접근 가능

#### POST `/api/v1/feed/{post_id}/like` 🔒
```json
Response: { "data": { "liked": bool, "like_count": int } }
```
- 좋아요 받은 게시자: `+5pt`
- 토글 방식 (이미 좋아요 → 취소)

#### POST `/api/v1/feed/{post_id}/view` 🔒
```json
Response: { "data": { "view_count": int } }
```
- 게시자 `+2pt` (하루 동일 영상 중복 view 제외)

---

### Rewards

#### GET `/api/v1/rewards/summary` 🔒
이번 주 포인트 현황.
```json
Response: {
  "data": {
    "week_label": "2026-W21",
    "current_week_points": 350,
    "satoshi_amount": 3500,
    "claimable": true,            // 1000 sats(100pt) 이상이고 미claim 상태
    "claim_deadline": "2026-05-25T23:59:59",  // 매주 월요일 자정
    "next_claim_date": "2026-05-26T00:00:00"
  }
}
```

#### POST `/api/v1/rewards/claim` 🔒
```json
Request:  { "ln_address"?: str }  // 미입력 시 프로필의 lightning_address 사용
Response: { "data": { "claim": ClaimSchema } }
```
검증:
- `satoshi_amount` >= 1000 (최소 claim 단위)
- 이번 주 이미 claim한 경우 `409 Conflict`
- `ln_address` 미등록 + 요청에도 없으면 `400`
- claim 생성 후 해당 주 포인트 차감

#### GET `/api/v1/rewards/claims` 🔒
```json
Response: { "data": { "claims": [ClaimSchema] } }
```

---

### Admin (운영자 전용)

헤더: `X-Admin-Key: <ADMIN_SECRET_KEY>`

#### GET `/admin/claims`
```
Query: status?: pending|paid|cancelled, limit?: int
Response: { "data": { "claims": [ClaimWithUserSchema] } }
```

#### PATCH `/admin/claims/{claim_id}/mark-paid`
```json
Request:  { "payment_memo"?: str }
Response: { "data": { "claim": ClaimSchema } }
```

#### GET `/admin/videos`
콘텐츠 모더레이션용 영상 목록.
```json
Response: { "data": { "videos": [VideoWithUserSchema] } }
```

#### PATCH `/admin/videos/{video_id}/reject`
```json
Response: { "data": { "video": VideoSchema } }
```

---

### System

#### GET `/health`
```json
Response: { "status": "ok", "version": "0.1.0" }
```

---

## 6. 포인트 시스템

### 적립 규칙
| 행동 | 포인트 | 일일 상한 |
|------|--------|----------|
| 영상 업로드 | +50pt | 5회 (250pt) |
| 좋아요 받음 | +5pt | 제한 없음 |
| 조회 받음 | +2pt | 중복 제외 |
| **일일 총 상한** | | **300pt** |

### 포인트 → Sats 환산
- **100pt = 1,000 sats** (하드코딩, 코드 상수로 관리)
- 최소 claim 단위: **1,000 sats (100pt)**

### 주간 claim 사이클
- 집계 기간: 월요일 00:00 ~ 일요일 23:59 (Asia/Seoul)
- claim 가능 시작: 주간 종료 후 (월요일 00:00부터)
- 미claim 포인트: 다음 주로 이월 없음, 만료 (런칭 초기엔 이월로 시작 후 검토)
- 주당 1회만 claim 가능

---

## 7. 영상 업로드 규칙

| 항목 | 제한 |
|------|------|
| 최대 길이 | 60초 |
| 최소 길이 | 10초 |
| 최대 파일 크기 | 200MB |
| 허용 포맷 | mp4, mov, webm |
| 일일 업로드 | 5회 |
| 중복 차단 | 파일 SHA256 해시 기준 |
| 보존 기간 | 30일 (이후 자동 삭제 — v2) |
| 태그 | 홈트, 러닝, 요가, 웨이트, 기타 |

---

## 8. 화면 목록 (Frontend Routes)

| 경로 | 화면 | 인증 |
|------|------|------|
| `/` | 피드 (풀스크린 세로형 영상) | 불필요 (좋아요·업로드는 요구) |
| `/login` | 로그인 / 회원가입 | — |
| `/upload` | 영상 업로드 (4단계) | 필요 |
| `/rewards` | 포인트 현황 + claim | 필요 |
| `/profile` | 내 프로필 + 설정 | 필요 |
| `/admin` | 운영자 대시보드 (claim 목록 + 영상 관리) | Admin Key |

### 피드 화면 상세
- 풀스크린 (`100dvh`), 한 번에 1개 영상
- 스와이프 업/다운으로 전환
- 자동재생 + 음소거 기본 (탭으로 토글)
- `muted` + `playsinline` 속성 (iOS Safari)
- IntersectionObserver로 뷰포트 진입 시 재생
- 우측 액션바: 좋아요, PointBadge
- 하단 그라디언트 오버레이: 닉네임, 태그 칩, 설명

### 업로드 화면 상세
- 4단계 진행바
  1. 영상 선택 (카메라/갤러리, 최대 60초)
  2. 운동 태그 선택 (복수 선택 칩)
  3. 썸네일 (자동 추출)
  4. 설명 입력 (140자, 선택)
- 업로드 중 진행률 % 표시
- R2 직접 업로드 (PUT presigned URL)

### 리워드 화면 상세
- 이번 주 포인트 대형 숫자
- D-day 카운트다운 (다음 claim 가능일)
- Claim 버튼 (비활성 시 잠금 + 이유 텍스트)
- Claim 바텀시트:
  - Lightning Address 입력 (저장된 주소 자동 완성)
  - 확인 → 성공 애니메이션 + **공유 버튼**
  - "지갑 없나요?" 링크 (Wallet of Satoshi 설치 가이드)
- 지급 이력 리스트 (날짜 / pt / sats / 상태)
- 포인트 획득 조건 요약 카드

---

## 9. 배포 설정

### Railway
```toml
# railway.toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
```

### Dockerfile (멀티스테이지)
```dockerfile
# Stage 1: Frontend build
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /app/frontend/dist ./static

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### FastAPI Static 파일 서빙
```python
# main.py
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    return FileResponse("static/index.html")
```

---

## 10. MVP 범위 (v0.1.0)

### 포함
- 회원가입/로그인 (이메일+비밀번호)
- 영상 업로드 (R2 presigned URL)
- 세로 영상 피드 (최신순)
- 좋아요, 조회수
- 포인트 적립 (업로드/좋아요/조회)
- 주간 Lightning claim (운영자 수동 송금)
- 운영자 대시보드 (claim 처리, 영상 관리)
- 어뷰징 방지 (해시 중복, 일일 상한)

### 제외 (v2)
- 소셜 기능 (댓글, 팔로우, DM)
- 추천 알고리즘
- 광고 SDK
- 푸시 알림
- AI 운동 인증 검증
- Cloudflare Stream 트랜스코딩
- Lightning 자동 지급 API

---

## 11. 운영 SOP

### 주간 BTC 지급 프로세스
1. 매주 월요일 00:00 이후 `/admin/claims?status=pending` 조회
2. 각 사용자의 `ln_address`와 `satoshi_amount` 확인
3. 운영자 Lightning 지갑 앱에서 직접 송금
4. 송금 완료 후 `/admin/claims/{id}/mark-paid` 호출
5. 실패 시 사용자에게 재claim 안내

### 콘텐츠 모더레이션
- `/admin/videos` 에서 신고된/최신 영상 확인
- 부적절 영상 → `/admin/videos/{id}/reject`
- SLA: 신고 후 24시간 이내 검토
