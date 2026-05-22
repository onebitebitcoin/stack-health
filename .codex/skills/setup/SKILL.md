---
name: setup
description: 새 프로젝트에 Codex/Claude 호환 multi-agent 토론 시스템을 인터뷰 기반으로 셋업한다.
---

# setup

새 프로젝트에 multi-agent 토론 시스템을 만들거나 현재 프로젝트의 토론 시스템을 재생성할 때 사용한다.

## Interview rule

- 반드시 한 번에 하나의 질문만 출력한다.
- 모든 질문이 끝나기 전에는 파일을 생성하지 않는다.
- 모든 답변을 모아 확인받은 뒤 일괄 생성한다.

## Questions

1. 프로젝트 또는 사업 이름은 무엇인가?
2. 한 문장으로 어떤 문제를 해결하거나 어떤 가치를 제공하는가?
3. 3개월 안에 달성하고 싶은 핵심 목표는 무엇인가?
4. 현재 단계는 무엇인가? 아이디어/기획/개발/베타/운영 중 하나로 확인한다.
5. 대표자 이름 또는 닉네임은 무엇인가?
6. 런칭 또는 주요 마일스톤 목표일이 있는가?
7. 주로 사용할 기술 스택은 무엇인가?
8. 기본 5개 역할(기획·개발·디자인·QA·악마의 변호인) 외 추가 역할이 있는가? finance, marketing, researcher, ops 중 선택한다.
9. 경쟁사나 벤치마킹 서비스가 있는가?
10. finance를 선택했다면 월 목표 매출과 주요 비용 항목은 무엇인가?

## Files to create after confirmation

- `.claude/agents/` — Claude 역할 에이전트
- `.claude/commands/discuss.md`, `report.md`, `interview.md`
- `.codex/agents/` — Codex native subagent TOML
- `.codex/skills/discuss/SKILL.md`, `report/SKILL.md`, `interview/SKILL.md`, `setup/SKILL.md`
- `docs/discussion-report-spec.md`
- `docs/team-vision.md`
- `meetings/INDEX.md`
- `AGENTS.md`

## Consistency rule

Claude command와 Codex skill은 같은 `docs/discussion-report-spec.md`를 단일 원본으로 공유해야 한다. 역할 수, 역할 경계, 라운드 구조, 합의 판정, 회의록 구조가 서로 달라지면 안 된다.
