# 소셜 기능 구현 계획서 — 캡션 수정 · 팔로우 · 친구 초대

> 작성일: 2026-06-29
> 대상: ①게시물 글(캡션·메타) 수정 ②팔로우(MVP) ③친구 초대(보상 없음)
> 구현 단위: **기능별 독립 단계/커밋**으로 진행 (A → B → C 순). 각 단계는 서로 의존하지 않는다.

---

## 0. 결정 사항 (2026-06-29 인터뷰)

| 항목 | 결정 |
|---|---|
| 팔로우 범위 | **관계 + 카운트 + 버튼 + 알림 (MVP)**. 팔로잉 전용 피드는 범위 밖 |
| 초대 보상 | **보상 없음** — 초대 링크 + 초대 수 집계만 |
| 캡션 수정 범위 | **캡션 + 태그 + 운동시간** 수정 가능 (영상·자막 burn-in은 불변) |
| 구현 단위 | **기능별 독립 단계/커밋** (캡션수정 → 팔로우 → 초대) |

## 1. 현황 (전부 신규)

- 팔로우/추천 흔적 없음. `User`에 팔로우 관계·추천코드 없음.
- `Post.caption`(140자)·`tags`·`workout_start/end` 존재하나 **수정 API 없음** (`/videos/posts/{id}`는 GET·DELETE만).
- `Notification`: `type`이 `comment`|`like`뿐, `post_id` **NOT NULL**, `actor_id` 존재.
- 가입 경로 3종: `POST /auth/register`, Google `GET /auth/google/callback`, Lightning `GET /auth/lnauth/verify`.
- 리워드 상태: `queued`(24h 내) → `settle_queued_rewards` → `fixed`. `revoke_queued_upload_reward(video_id)`로 회수.

---

## 단계 A — 게시물 글(캡션·메타) 수정 ⭐ 먼저

### 범위
본인(또는 admin) 게시물의 `caption`, `tags`(메인/서브 카테고리), `workout_start`, `workout_end` 수정. 영상·자막(burn-in)·썸네일은 불변.

### A-1. 백엔드 — `PATCH /videos/posts/{post_id}` (`backend/app/routes/videos.py`)
- 인증: `get_current_user`. 본인 `post.user_id == current_user.id` 또는 `is_admin` (DELETE 패턴 재사용).
- 입력(Pydantic `PostUpdateRequest`, `schemas/video.py`): `caption?`, `tags?`(list[str]), `workout_start?`, `workout_end?` — 모두 optional, 보낸 필드만 수정.
- 검증: caption ≤ 140자, workout "HH:MM" 형식, tags는 `_parse_tags` 규칙.
- **포인트 재산정 (핵심 주의)**: `tags[0]`(메인 카테고리)이 바뀌면 `points_for_tags` 결과가 달라진다.
  - 해당 영상의 upload 리워드가 **`queued` 상태일 때만** 재산정: 기존 queued 리워드를 revoke 후 새 포인트로 `add_points` 재지급.
  - 이미 **`fixed`**(24h 경과)면 메인 카테고리 변경을 **거부**(400, 캡션·서브태그·운동시간은 허용) — 확정 포인트 소급 변경 방지.
  - 서브 카테고리만 변경/캡션/시간은 포인트 무관 → 자유.
- 응답: 수정된 Post 스키마.

### A-2. 프론트
- `frontend/src/api/client.ts` 호출 추가, `types.ts`에 업데이트 타입.
- 본인 게시물에서 진입: `ChallengeDetailPage`/`UserProfilePage`/피드 상세에서 본인이면 "수정" 버튼.
- **새 페이지** `frontend/src/pages/PostEditPage.tsx` (`/posts/:postId/edit`, 새 URL — 모달 대체 금지 규칙). 캡션·카테고리·운동시간 폼 (업로드 `StepMeta` 입력 UI 재사용).
- 수정 성공 시 관련 쿼리 무효화(`my-posts`, `feed`, 해당 post).

### A-3. 테스트
- 백엔드 `tests/test_videos.py`(또는 신규): 본인 수정 200 / 타인 403 / 없음 404 / caption 초과 400 / 메인카테고리 변경(queued) 재산정 / 메인카테고리 변경(fixed) 거부 / 부분 수정.
- 프론트 Vitest: PostEditPage 폼 검증·제출.

### A-4. 마이그레이션 / 리스크
- DB 스키마 변경 **없음** (기존 컬럼).
- 리스크: 포인트 재산정 일관성 → queued/fixed 분기로 한정, 리워드 테스트로 보호.

---

## 단계 B — 팔로우 (MVP)

### B-1. DB
- 신규 모델 `Follow` (`backend/app/models/follow.py`):
  - `id`, `follower_id`(FK users, 팔로우 하는 사람), `following_id`(FK users, 팔로우 당하는 사람), `created_at`.
  - `UniqueConstraint(follower_id, following_id)` + 인덱스(`following_id`로 팔로워 조회, `follower_id`로 팔로잉 조회).
- `Notification` 확장 (마이그레이션):
  - `post_id`를 **nullable**로 완화 (팔로우 알림은 게시물 없음).
  - `type`에 `"follow"` 추가 (문자열이라 스키마 변경 없음, 값만 확장).
  - 팔로우 알림: `user_id`=팔로우당한 사람, `actor_id`=팔로우한 사람, `type="follow"`, `post_id=NULL`.
- Alembic: `follows` 테이블 생성 + `notifications.post_id` nullable. (nullable 완화는 기존 데이터 안전)

### B-2. 백엔드 (`backend/app/routes/users.py`)
- `POST /users/{user_id}/follow`: self-follow 금지(400), 차단/없는 유저 검사, 중복은 idempotent(이미 팔로우면 200), `Follow` 생성 + 팔로우 알림 생성.
- `DELETE /users/{user_id}/follow`: 언팔로우 (없으면 idempotent).
- `GET /users/{user_id}/followers`, `GET /users/{user_id}/following`: 페이지네이션 목록(유저 요약 + 내 팔로우 여부).
- `GET /users/{user_id}/profile` 응답에 `follower_count`, `following_count`, `is_following`(요청자 기준) 추가.
- 알림: `notifications.py` 응답에 `follow` 타입 포함(actor 정보), unread 카운트 합산.

### B-3. 프론트
- `UserProfilePage`: 팔로우/언팔로우 버튼(낙관적 업데이트), 팔로워·팔로잉 카운트 표시(탭/링크).
- **새 페이지** `FollowListPage.tsx` (`/users/:userId/followers`, `/users/:userId/following`) — 목록 + 각 항목 팔로우 버튼.
- 알림 목록(`NotificationsPage` 또는 해당 컴포넌트)에 "○○님이 팔로우했습니다" 항목 + 프로필 이동.
- i18n ko/en 키 추가.

### B-4. 테스트
- 백엔드: follow/unfollow/self-follow 거부/중복 idempotent/카운트 정확/profile is_following/팔로우 알림 생성/차단·밴 유저 처리.
- 프론트 Vitest: 팔로우 버튼 토글, 목록 렌더.

### B-5. 리스크
- `notifications.post_id` nullable 마이그레이션 — 기존 코드가 `post_id` not-null 가정하는 곳 점검(예: 삭제 시 `Notification.post_id == post_id` 쿼리는 영향 없음).
- N+1 방지: 목록/프로필에서 팔로우 여부 batch 조회.

---

## 단계 C — 친구 초대 (보상 없음)

### C-1. DB
- `User` 확장 (마이그레이션):
  - `referral_code`(String, unique, index) — 가입 시 생성. 기존 유저는 백필.
  - `referred_by_id`(FK users.id, nullable) — 누구 초대로 가입했는지.
- 기존 유저 `referral_code` 백필: Alembic data migration(짧은 base62 코드, 충돌 시 재생성).

### C-2. 백엔드
- 코드 생성 유틸(`services/`): 가입 시 unique `referral_code` 발급(기존 `share_token` 생성 로직 참고).
- 가입 경로 3종 모두 `ref` 코드 수용:
  - `POST /auth/register`: `RegisterRequest`에 `referral_code?` 추가 → 유효하면 `referred_by_id` 기록.
  - Google/Lightning: state 또는 쿼리로 `ref` 전달 → 신규 생성 유저에 기록. (OAuth state에 실어 콜백에서 복원)
- `GET /users/me/referral`: 내 코드, 초대 링크, **초대 수**(`referred_by_id == me` count) 반환.
- 자기 자신/이미 가입자 ref 무시(신규 가입에만 적용).

### C-3. 프론트
- 설정/프로필에 "친구 초대" 진입 → 초대 링크 표시 + `navigator.share`/클립보드 복사 + 초대 수.
- 초대 링크: `/login/register?ref=CODE` (혹은 `/?ref=CODE`).
- 가입 진입 시 `ref` 파라미터를 `localStorage`에 저장 → email/google/lightning 어느 경로로 가입하든 전송.
- i18n ko/en.

### C-4. 테스트
- 백엔드: referral_code 생성·unique, register에 ref 전달 시 referred_by 기록, 잘못된/자기 ref 무시, /me/referral 집계.
- 프론트 Vitest: ref localStorage 저장→가입 전송, 초대 화면 렌더.

### C-5. 리스크
- referral_code 백필 시 unique 충돌 → 재시도 루프.
- OAuth(state) 경유 ref 전달이 까다로움 → 1차는 email register만 ref 지원, OAuth는 후속(범위 분리 가능).

---

## 2. 구현 순서 & 단위

| 단계 | 기능 | 마이그레이션 | 모델 복잡도 | 비고 |
|---|---|---|---|---|
| **A** | 캡션·메타 수정 | 없음 | LOW | 가장 단순, 먼저. 포인트 재산정만 주의 |
| **B** | 팔로우 MVP | follows 신규 + notifications nullable | MEDIUM | 알림 연계 |
| **C** | 친구 초대 | users 컬럼 2개 + 백필 | MEDIUM | OAuth ref는 후속 분리 가능 |

각 단계: 모델→마이그레이션→백엔드+테스트→프론트+테스트→린트/테스트 PASS→독립 커밋→VERSION bump(MINOR).
모델 라우팅(MANDATORY): A=MEDIUM(sonnet), B/C=MEDIUM~HIGH(스키마·마이그레이션 포함 시 opus).

## 3. 공통 테스트 게이트
- 기존 회귀: backend `pytest` 전체 GREEN(커버리지 ≥75%), frontend `vitest`+`tsc`+`eslint`+build GREEN.
- 각 단계 마이그레이션 후 `alembic upgrade head` 검증.

## 4. 확정 / 구현 결과
1. **태그 메인 카테고리 변경 + fixed 리워드**: **거부** (queued만 재산정) — 구현 완료.
2. **팔로우 알림**: 기존 `NotificationsPage` + `notification` 네임스페이스에 `follow` 타입 통합.
3. **초대 OAuth(ref)**: 1차 **email register만 ref 기록**. Google/Lightning 가입은 referral_code 발급만(코드 부여), ref 기록은 후속. `?ref=`는 App에서 localStorage 캡처되므로 OAuth 가입에 ref 기록을 붙이는 후속 작업은 작음.
4. **초대 링크 경로**: `/login/register?ref=CODE` 확정.

## 구현 결과 요약 (전 단계 완료)
- 단계 A: `PATCH /videos/posts/{id}` + `PostEditPage`(`/posts/:id/edit`) — backend 10 테스트.
- 단계 B: `follows` 테이블 + `notifications.post_id` nullable, follow API, `FollowListPage`, 프로필 카운트·버튼 — backend 9 테스트.
- 단계 C: `users.referral_code`(백필)·`referred_by_id`, `/users/me/referral`, `InvitePage`(`/invite`), `?ref=` 캡처 — backend 6 테스트.

---

## 5. 다음 액션
승인 시 **단계 A(캡션·메타 수정)**부터 착수 — `PostUpdateRequest` + `PATCH /videos/posts/{id}` + `PostEditPage` + 테스트.
