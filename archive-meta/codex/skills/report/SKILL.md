---
name: report
description: 미결 감독자 결정 사항을 한 번에 하나씩 인터뷰하고 report, data.json, 회의록을 갱신한다.
---

# report

사용자가 진행 보고서 작성, 미결 결정 정리, 회의록 기반 보고 업데이트를 요청할 때 사용한다.

## Shared contract

먼저 `docs/discussion-report-spec.md`를 읽고 `Report workflow`를 따른다.

## Codex adapter behavior

1. `TARGET_DATE`를 결정한다. 명시 날짜가 없으면 현재 KST 날짜를 사용한다.
2. 입력을 읽는다.
   - `meetings/INDEX.md`
   - target date의 모든 회의록
   - 기존 `report-<date>.md`가 있으면 포함
   - `data.json`이 있으면 포함
3. `### 감독자 결정 필요` 항목을 추출하고 이미 결정 결과가 있는 항목은 제외한다.
4. 감독자 인터뷰는 반드시 한 번에 하나의 질문만 한다.
5. 모든 질문이 끝나기 전에는 파일을 수정하지 않는다.
6. 인터뷰 완료 후 일괄 갱신한다.
   - `report-<date>.md`
   - `data.json` (존재하는 경우)
   - 관련 회의록 파일
7. 마지막에 수정된 파일과 다음 액션을 한국어로 요약한다.

## Guardrails

- 추정으로 감독자 결정을 채우지 않는다.
- 이미 결정된 항목을 다시 묻지 않는다.
- 질문은 짧고 하나씩만 한다.
