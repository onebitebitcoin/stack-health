---
name: interview
description: 최근 7일 회의록과 data.json에서 미결 감독자 결정 사항을 수집해 하나씩 인터뷰한다.
---

# interview

사용자가 미결 결정 사항을 정리하거나 감독자 인터뷰를 진행하자고 요청할 때 사용한다.

## Shared contract

먼저 `docs/discussion-report-spec.md`의 `/interview` 규칙을 읽는다.

## Codex adapter behavior

1. `data.json`이 있으면 `decisions[]`에서 `status === "pending"` 항목을 추출한다.
2. `meetings/INDEX.md`에서 최근 7일 회의 파일을 나열한다.
3. 각 회의 파일에서 `### 감독자 결정 필요` 항목을 수집한다.
4. 이미 `## 감독자 결정 결과` 또는 명시적 결정 완료 표시가 있는 항목은 제외한다.
5. 긴급도 순으로 정렬한다.
   - 🔴 즉시
   - 🟡 이번 주
   - 🟢 장기
6. 한 번에 하나씩 질문한다.
7. 모든 인터뷰 완료 후 관련 파일을 일괄 업데이트한다.

## Guardrails

- 여러 질문을 한 번에 묻지 않는다.
- 파일 업데이트는 모든 답변 수집 후 한 번에 수행한다.
- 사용자의 답변을 간단히 확인하고 다음 질문으로 넘어간다.
