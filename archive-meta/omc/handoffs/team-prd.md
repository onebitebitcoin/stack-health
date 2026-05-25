## Handoff: team-prd → team-exec

### 피드백 통합 결정

**Decided:**
- P1-2 운동 증명 카드: 핵심 유지. 공유 텍스트에 "이번 주 포인트" 포함해 비트코인 가치 연결
- P1-1 스트릭 배지: 유지. 단 긍정적 프레이밍 (처벌 없음, "오늘 시작해보세요" 0스트릭 메시지)
- P2-2 월별 리포트: 유지. 기존 API 활용, 공유 기능 포함
- P1-3 개인기록: DB 모델 불필요. 단순 통계 카드 3개 (총업로드, 스트릭, 총포인트)로 대체

**Rejected:**
- P2-1 응원 기능(Cheer): 좋아요와 UX 중복, 인지 마찰 유발 → 완전 제외
- PersonalRecord DB 모델: 복잡도/리스크 대비 가치 불충분 → 제외

**Risks:**
- 공유 카드 바이럴율 낮을 수 있음: 공유 텍스트에 사토시/포인트 수치 포함해 구체성 확보
- 스트릭 불안감: 0 스트릭 시 긍정 문구, 리셋 강조 없음
- me/stats 엔드포인트: 간단한 쿼리지만 N+1 쿼리 주의

**Files to create/modify:**
- backend/app/routes/users.py → GET /api/v1/me/stats 추가
- frontend/src/pages/HistoryPage.tsx → StreakBadge + MonthlyReport 카드
- frontend/src/pages/UploadPage.tsx → ProofCard 모달
- frontend/src/pages/ProfilePage.tsx → 통계 카드 섹션

**Remaining:**
- 백엔드: me/stats 엔드포인트 구현
- 프론트: 3개 페이지 수정
- 테스트: me/stats API 테스트
- 버전 bump 0.18.0 + 커밋 + 푸시
