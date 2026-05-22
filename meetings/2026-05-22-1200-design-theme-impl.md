# 디자인 테마 구현 확정 회의

**일시**: 2026-05-22 12:00  
**안건**: 5개 테마 토큰 구현 + /admin 테마 프리뷰 UI 확정  
**참석**: 플래너, 개발자, 디자이너, QA, 데블, 재무, 마케팅, 리서처, 운영

---

## 합의 및 결정

### 결정 1: 테마 구현 방식 — Static tokens.css

- 런타임 DB/KV 주입 없이 정적 CSS 파일로 관리
- `frontend/src/tokens.css` 에 5개 테마 블록 정의
- `[data-theme="X"]` CSS 선택자 방식
- Zustand + localStorage 로 선택 상태 영속
- 배포 시 재빌드로 테마 추가/변경

### 결정 2: /admin 테마 프리뷰

- URL: `/admin?theme=X` 쿼리파라미터로 즉시 프리뷰
- `document.documentElement.setAttribute('data-theme', value)` 실시간 적용
- 별도 DB/KV 불필요 — 로컬 상태만
- AdminPage 상단에 테마 전환 버튼 UI 추가

### 결정 3: 확정 5개 테마 (오렌지/비트코인 색상 완전 배제)

| ID | 이름 | 계열 | 포인트 컬러 | 배경 |
|---|---|---|---|---|
| `sapphire` | Sapphire Premium | 다크 | #1E6FFF (파랑) | #0A0A0A |
| `volt` | Volt Dark | 다크 | #B5FF2E (라임) | #0D0D0D |
| `indigo` | Royal Indigo | 다크 | #7C3AED (보라) | #0F0F0F |
| `arctic` | Arctic Light | 라이트 | #2563EB (파랑) | #F8FAFC |
| `forest` | Forest Light | 라이트 | #059669 (초록) | #FAFAF9 |

> **제외**: Bitcoin Black (#F7931A) — 오렌지 = 비트코인 연상 → 감독자 지시 위반

### 결정 4: WCAG AA 보장

- 모든 테마: 텍스트/배경 대비비 4.5:1 이상
- 다크 테마: 라임(Volt) accent-fg = #0D0D0D (검정)
- 라이트 테마: accent-fg = #FFFFFF (흰색)

### 결정 5: 기본 테마

- 기본값: `sapphire` (Sapphire Premium)
- localStorage 영속, 없으면 sapphire 적용

---

## 구현 범위

1. `frontend/src/tokens.css` — 5개 테마 CSS 변수 블록
2. `frontend/tailwind.config.js` — CSS 변수 기반 시맨틱 컬러 토큰
3. `frontend/src/store/theme.ts` — Zustand 테마 스토어
4. `frontend/src/main.tsx` — 앱 시작 시 테마 초기화
5. 전체 컴포넌트 — 하드코딩 색상 → 시맨틱 토큰 교체
6. `frontend/src/pages/AdminPage.tsx` — 테마 프리뷰 UI 추가
