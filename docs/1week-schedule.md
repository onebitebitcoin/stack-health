# 1주일 개발 일정표

> 런칭 목표: 2026-05-28 (Day 7)
> 스택: React + FastAPI / Cloudflare R2 / Blink API (Lightning) / Redis + ffmpeg 워커 / Railway
> 초기 운영비: 10만원 (기확보)
> **최종 동기화**: 2026-05-26 (git log + meetings/INDEX.md 기준)
> 매일 23:00 KST 업데이트 (ops 담당)

---

## 전체 타임라인

```
Day 1 (5/22) ──▶ Day 2 (5/23) ──▶ Day 3 (5/24) ──▶ Day 4 (5/25)
기반 셋업        피드 백엔드        업로드 + ⚠️체크     포인트 시스템

Day 5 (5/26) ──▶ Day 6 (5/27) ──▶ Day 7 (5/28)
Lightning 연동   통합·배포 준비     런칭 🚀
```

---

## Day 1 — 2026-05-22 | 기반 셋업

### 인프라 (필수 완료)
- [x] Railway 프로젝트 생성 (Backend 서비스 + PostgreSQL 추가)
- [x] Cloudflare R2 버킷 생성 + CORS 설정 + 퍼블릭 도메인 연결
- [x] 도메인 구매 + Railway 연결
- [x] `.env` 파일 구조 확정 (R2 키, DB URL, JWT 시크릿, ADMIN_SECRET_KEY + BLINK_API_KEY/GOOGLE_*/REDIS_URL 추가)

### Backend
- [x] FastAPI 프로젝트 구조 셋업 (`app/`, `routes/`, `models/`, `schemas/`)
- [x] DB 모델 작성: `users`, `videos`, `posts`, `reward_points`, `lightning_claims`
- [x] Alembic init + 첫 마이그레이션 (`alembic upgrade head`)
- [x] Auth API: `POST /auth/register`, `POST /auth/login` (JWT)
- [x] `GET /health` 엔드포인트
- [x] **어뷰징 방지 Day 1 구현**: 파일 해시 중복 검사 로직, 일일 업로드 5회 상한 미들웨어

### Frontend
- [x] Vite + React + TailwindCSS + shadcn/ui 프로젝트 셋업
- [x] 라우터 구조 (`/`, `/upload`, `/rewards`, `/profile`, `/login`)
- [x] 컬러 토큰 + 타이포 스케일 확정
- [x] 공통 컴포넌트 인벤토리 (BottomNav, TagChip, PointBadge)
- [x] 로그인/회원가입 화면

**Day 1 완료 기준**: Railway에 health check 응답, R2 버킷 접근 가능, 로그인 API 동작

---

## Day 2 — 2026-05-23 | 피드 시스템

### Backend
- [x] `GET /api/v1/feed` (최신순 페이지네이션, cursor-based)
- [x] `POST /api/v1/posts/{id}/like`
- [x] `POST /api/v1/posts/{id}/view`
- [x] `GET /api/v1/posts/{id}`

### Frontend
- [x] 피드 컴포넌트 (`VideoCard`, 풀스크린 `100dvh`)
- [x] 스와이프 업/다운 제스처 (react-swipeable 또는 직접 구현)
- [x] 자동재생 + 음소거 기본 (IntersectionObserver로 뷰포트 진입 시 재생)
- [x] iOS Safari `muted` + `playsinline` 속성
- [x] 우측 액션바 (좋아요, 포인트 뱃지)
- [x] 하단 오버레이 (닉네임, 운동 태그, 설명)
- [x] 비로그인 시청 가능 + 좋아요 클릭 시 로그인 유도 바텀시트

**Day 2 완료 기준**: 피드에서 영상 스와이프 + 자동재생 동작 (더미 데이터 사용 가능)

---

## Day 3 — 2026-05-24 | 영상 업로드 + ⚠️ LNbits 체크포인트

### Backend
- [x] `POST /api/v1/videos/presigned-url` (R2 presigned URL 발급)
- [x] `POST /api/v1/videos/confirm` (업로드 완료 확인 + DB 저장 + 포인트 적립 트리거)
- [x] R2 presigned URL 권한 설정 확인 (15분 만료)
- [x] 파일 해시 중복 검사 통합

### Frontend
- [x] 업로드 화면 4단계 (영상 선택 → 운동 태그 → 썸네일 → 설명)
- [x] 상단 진행바
- [x] R2 직접 업로드 구현 (PUT presigned URL + 진행률 표시)
- [x] 업로드 완료 후 confirm API 호출

### Lightning 관련 설정 (없음)
- Lightning 외부 API 불필요 — 운영자가 지갑 앱으로 직접 송금

**Day 3 완료 기준**: 영상 업로드 R2 성공 + Blink API 키 환경변수 설정 완료

---

## Day 4 — 2026-05-25 | 포인트 시스템

### Backend
- [x] 포인트 적립 로직 (`reward_points` INSERT): 업로드 시 +50pt, view 시 +2pt, like 받을 시 +5pt
- [x] 일일 적립 상한 적용 (업로드 5회, 총 일일 300pt 상한)
- [x] `GET /api/v1/rewards/summary` (이번 주 포인트, 지급 예정일, claim 가능 여부)
- [x] 주간 레이블(`YYYY-WW`) 자동 계산
- [x] 포인트 → sats 환산: 100pt = 1,000 sats (하드코딩)
- [x] 최소 claim 임계값: 1,000 sats (100pt 이상일 때만 claim 버튼 활성)

### Frontend
- [x] 리워드 화면: 이번 주 포인트 대형 숫자 + D-day 카운트다운
- [x] Claim 버튼 (주간 마감 후 활성, 임계값 미달 시 잠금 표시)
- [x] 포인트 획득 조건 요약 카드

**Day 4 완료 기준**: 업로드 시 포인트 적립 + 리워드 화면 데이터 표시 동작

---

## Day 5 — 2026-05-26 | Lightning Claim 연동

### Backend
- [x] `POST /api/v1/rewards/claim`
  - 사용자 Lightning Address + sats 금액을 DB에 저장 (status: pending)
  - 포인트 차감 처리
  - 끝 (외부 API 호출 없음)
- [x] `GET /api/v1/rewards/claims` (사용자 청구 이력)
- [x] `GET /admin/claims` (운영자: pending 목록 조회)
- [x] `PATCH /admin/claims/{id}/mark-paid` (운영자: 직접 송금 후 완료 처리)

### Frontend
- [x] claim 바텀시트: Lightning 주소 입력 (저장된 주소 자동 완성) → 확인 → 전송 완료 애니메이션
- [x] 지급 이력 리스트 (날짜 / 포인트 / sats / 상태)
- [x] "지갑 없나요?" 링크 카드 (Wallet of Satoshi / Zeus 설치 가이드)
- [x] BTC 받기 성공 애니메이션 + **공유 버튼** (바이럴 소재)
- [x] 운영자 대시보드 화면

**Day 5 완료 기준**: claim 요청 → LNbits 지급 또는 수동 정산 큐 등록 동작 확인

---

## Day 6 — 2026-05-27 | 통합 + 배포 준비

### Backend
- [ ] `GET /api/v1/auth/me` (마이페이지 데이터)
- [ ] Rate limiting 적용 (업로드·claim 엔드포인트)
- [ ] SQLite → PostgreSQL 마이그레이션 확인 (Railway DB URL 연결)
- [ ] 전체 환경변수 점검 (프로덕션 env)
- [ ] 에러 핸들링 보강 + 로그 정비

### Frontend
- [ ] 마이페이지: 업로드 그리드, 포인트 요약, 설정(로그아웃, Lightning 주소 편집)
- [ ] 전체 네비게이션 연결 (BottomNav 4탭: 피드/업로드/리워드/프로필)
- [ ] 프론트 빌드 검증 (`npm run build` 성공)
- [ ] Empty State 처리 (피드 없을 때, 포인트 0일 때)

### 통합 테스트 (E2E 수동)
- [ ] 회원가입 → 업로드 → 포인트 적립 → claim 요청 → 지급 완료 플로우 3회 반복
- [ ] 파일 해시 중복 업로드 차단 확인
- [ ] 일일 3회 상한 확인 (코드 기준: DAILY_MAX_UPLOADS=3)
- [ ] 모바일 Safari/Chrome 자동재생 확인

**Day 6 완료 기준**: E2E 플로우 전체 통과, 빌드 성공

---

## Day 7 — 2026-05-28 | 런칭 🚀

### 오전 (배포)
- [ ] Dockerfile 최종화 (멀티스테이지 빌드)
- [ ] Railway 프로덕션 배포 + 헬스체크 확인
- [ ] 도메인 DNS 연결 확인
- [ ] Sentry 또는 Railway 로그 모니터링 설정

### 오후 (런칭 리허설)
- [ ] 운영자 수동 송금 리허설 1건 (실제 Lightning 지급)
- [ ] 첫 사용자 계정 생성 + 운동 영상 업로드 + 포인트 적립 + claim 성공 확인
- [ ] 런칭 발표용 "첫 BTC claim 성공" 영상 촬영

### 마케팅 실행
- [ ] 한입 비트코인 채널 런칭 포스팅
- [ ] 트위터(X) + 텔레그램 동시 발행
- [ ] 첫 BTC claim 성공 영상 릴스/쇼츠 업로드

**Day 7 완료 기준**: 실제 사용자 1명 이상 운동 영상 업로드 + 포인트 적립 확인

---

## Critical Path

```
Day 1: DB + Auth + R2 버킷
    ↓
Day 3: R2 presigned URL 업로드 성공 + ⚠️ LNbits 연결 테스트
    ↓ (실패 시 수동 정산 확정)
Day 5: Lightning claim API 완성
    ↓
Day 6: E2E 전체 플로우 통과
    ↓
Day 7: 런칭
```

---

## Go / No-go 기준 (Day 7 오전)

| 항목 | Go | No-go |
|------|----|-------|
| `/health` 응답 | ✅ | ❌ 배포 중단 |
| 영상 업로드 + R2 저장 | ✅ | ❌ |
| 포인트 적립 정합성 | ✅ | ❌ |
| Claim 화면 + 지갑 주소 입력 | ✅ | ❌ |
| Lightning 지급 OR 수동 정산 처리 경로 | ✅ 둘 중 하나 | ❌ 둘 다 없음 |
| 모바일 Chrome/Safari 피드 자동재생 | ✅ | ⚠️ 경고 후 런칭 가능 |

---

## 버전 계획

| 버전 | 내용 | 타겟 |
|------|------|------|
| v0.26.x | 현재 (런칭 직전) — 피드/업로드/포인트/클레임/챌린지/댓글 구현 완료 | 2026-05-28 런칭 |
| v0.27.0 | 안정화, 어드바이저 역할 시스템, 업로드 전 5가지 질문 | 런칭 2주 후 |
| v0.28.0 | 추천 알고리즘, 광고 SDK, 푸시 알림 | 1개월 후 |
| v1.0.0 | 월 100만원 광고 수익 달성 시점 | MAU 1,400명+ |
