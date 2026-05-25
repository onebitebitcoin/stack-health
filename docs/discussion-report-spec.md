# Discussion / Report Shared Specification

This document is the single source of truth for the discussion and reporting workflow.

## 1. Shared goals

- Turn a business agenda into a structured multi-role discussion.
- Produce a durable meeting record with explicit agreements, unresolved issues, supervisor decisions, and follow-up tasks.
- Turn unresolved supervisor decisions into a one-question-at-a-time reporting interview.
- Keep downstream artifacts compatible with the dashboard and Telegram sender.

## 2. Canonical roles

Every new discussion uses the roles configured for this project (see .claude/commands/discuss.md).

| Role id | Display name | Responsibility |
|---|---|---|
| `planner` | 기획 | 사업 우선순위, 로드맵 정합성, 범위 관리, 인허가·리스크 |
| `developer` | 개발 | 기술 타당성, 자동화 구현 난이도, 스택 적합성 |
| `designer` | 디자인 | 주문 UX, 브랜드 일관성, 채널별 사용자 경험 |
| `qa` | QA | 검증 지표, 실패 시나리오, 운영 리스크, 테스트 가능성 |
| `devil` | 악마의 변호인 | 합의 편향 방지, 미검증 가정과 간과된 리스크 지적 |
| `finance` | 재무 | 비용 구조, 원가율(COGS), 매출·이익 시뮬레이션, 손익분기 분석 |
| `marketing` | 마케팅 | 채널 전략, 고객 획득, 가격, 경쟁사 분석 |
| `researcher` | 리서처 | 시장조사, 문헌 정리, 외부 데이터 수집 |
| `ops` | 운영 | 운영·프로세스 최적화, SOP 설계 |

## 3. Intent classification

### Summary / report intent
Use the summary path when the request asks for current status, latest meeting results, progress, or a summary.

### Discussion intent
Use the discussion path for a new decision agenda, strategy comparison, or unresolved problem.

## 4. Discussion ground rules

### Before the rounds
- Read `docs/team-vision.md` together with the shared spec and project context.
- State what this meeting **must decide**.
- State what this meeting will **not decide**.
- Reopened topics must identify the prior meeting or prior unresolved decision they are continuing from.

### During the discussion
- Claims must be grounded in repo evidence and, when needed, external evidence.
- Disagreement is expected; do not collapse meaningful conflict just to create consensus.
- The devil role must challenge shared assumptions, repeated reasoning loops, and untested risk claims.
- If a proposal is only acceptable under conditions, record it as a **conditional approval**.

### Closing rules
- Every material agenda item must end in exactly one of: `결정` / `보류` / `외부확인 필요`
- Every follow-up task must include: one owning role + one priority tag (`P0`, `P1`, `P2`)

## 5. Discussion workflow

### Summary path
Do not spawn role agents. Read data and return: project summary, latest meeting, agreements, unresolved issues, active milestone, unfinished tasks, pending supervisor decisions.

### Discussion path
Run two rounds with all configured roles.

#### Round 1
- Run all roles in parallel when the runtime supports it.
- Each role reads `docs/team-vision.md` first.
- Each role grounds claims in repo evidence.

#### Round 2
- Run all roles again after providing the complete R1 transcript.
- Each role responds to the other roles.

#### Synthesis rules
- `합의된 사항`: supported by at least 3 roles
- `미해결 쟁점`: challenged by at least 2 roles
- `감독자 결정 필요`: no role supplied a sufficient resolution
- `⚠️ 악마의 변호인 미해소 경고`: a devil's-advocate warning not adequately answered
- `후속과제`: role-owned next actions, each with `P0` / `P1` / `P2`

## 6. Meeting artifact contract

### File location and naming
- Directory: `meetings/`
- Filename: `YYYY-MM-DD-HHMM-<slug>.md`
- Timezone: `Asia/Seoul`
- Add a matching row to `meetings/INDEX.md`

### Required sections
1. title block (date, agenda, attendees, supervisor)
2. `## R1 의견`
3. `## R2 토론`
4. `## 합의 및 결정`
5. `### 합의된 사항`
6. `### 미해결 쟁점`
7. `### 감독자 결정 필요`
8. (optional) `### ⚠️ 악마의 변호인 미해소 경고`
9. `## 후속과제`

## 7. Report workflow

### Inputs
Read: project context, `meetings/INDEX.md`, every meeting on the target date, existing report when present.

### Interview rule
- Ask exactly one question at a time.
- Confirm each answer before advancing.
- Do not update files until the interview is complete.

### Outputs
After the interview: update `report-<date>.md`, update `data.json` if present, update affected meeting files.

## 8. Interview workflow (/interview)

Scans all meeting files within the last 7 days, collects pending supervisor decisions, asks them one at a time sorted by urgency (🔴즉시 → 🟡이번 주 → 🟢장기).

## 9. 컨텍스트 로딩 최적화 가이드

각 역할 에이전트 파일은 `반드시 docs/discussion-report-spec.md를 먼저 읽고 따른다` 지시를 포함한다.
9개 에이전트가 라운드마다 각자 파일을 읽으면 토론 1회당 최대 18회 파일 읽기가 발생한다.

**1회 로드로 줄이는 방법**: `/discuss` 오케스트레이터가 이 파일을 시작 시 1회 읽어 전체 내용을
각 에이전트 프롬프트의 `<spec>` 블록으로 직접 첨부한다. 이렇게 하면 개별 에이전트가
파일을 다시 읽지 않아도 되므로 컨텍스트 비용이 줄어든다.

권장 오케스트레이터 패턴:
```
1. 오케스트레이터가 docs/discussion-report-spec.md 1회 Read
2. 해당 내용을 각 에이전트 프롬프트에 주입 (또는 컨텍스트로 전달)
3. 에이전트 내부의 "먼저 읽고 따른다" 지시는 fallback용으로 유지
```
