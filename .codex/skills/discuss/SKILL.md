---
name: discuss
description: 운동하고 비트코인 받자 프로젝트의 9개 역할 토론 또는 요약/보고 워크플로를 실행하고 회의록을 저장한다.
---

# discuss

사용자가 새 안건을 역할별로 토론하거나, 현재 진행 현황/최근 회의/미결 사항 요약을 요청할 때 사용한다.

## Shared contract

먼저 `docs/discussion-report-spec.md`를 읽는다. 이 문서가 아래 항목의 단일 원본이다.

- 의도 분류: summary/report intent vs discussion intent
- canonical roles
- 토론 규칙
- R1/R2 라운드
- synthesis rules
- meeting artifact contract

## Codex adapter behavior

1. 사용자 요청을 공통 규격에 따라 분류한다.
2. 요약/보고 의도라면 역할 에이전트를 생성하지 않고 summary path를 직접 수행한다.
3. 토론 의도라면 가능할 때 OMX 런타임 안에서 Codex native subagents를 9개 프로젝트 역할(`bw-*`)로 병렬 실행한다. `$team`이 필요한 대규모 구현과 달리, 이 스킬의 역할 lane은 읽기 중심 토론/검토 용도다.
   - `bw-planner`
   - `bw-developer`
   - `bw-designer`
   - `bw-qa`
   - `bw-devil`
   - `bw-finance`
   - `bw-marketing`
   - `bw-researcher`
   - `bw-ops`
4. 모든 역할에게 같은 안건과 아래 파일을 제공한다.
   - `docs/discussion-report-spec.md`
   - `docs/team-vision.md`
   - 필요 시 `docs/vision.md`, `SPEC.md`, 관련 회의록
5. R1 전체 발언을 모은 뒤 R2를 진행한다.
6. 오케스트레이터가 synthesis rules에 따라 최종 합의를 직접 작성한다.
7. 결과를 저장한다.
   - `meetings/YYYY-MM-DD-HHMM-<slug>.md`
   - `meetings/INDEX.md`에 한 줄 추가

## Output quality bar

- 결정해야 하는 것 / 결정하지 않는 것을 명시한다.
- 모든 주요 항목은 `결정` / `보류` / `외부확인 필요` 중 하나로 끝난다.
- 후속과제는 담당 역할과 `P0`/`P1`/`P2` 우선순위를 가진다.
- 악마의 변호인 경고가 해소되지 않았으면 별도 경고로 남긴다.
