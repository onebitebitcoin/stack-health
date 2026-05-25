# archive-meta

이 디렉토리는 과거 OMX(oh-my-codex) 및 OMC(oh-my-claudecode) 시도의 흔적이다.

## 내용

| 디렉토리 | 원래 위치 | 설명 |
|---|---|---|
| `codex/` | `.codex/` | OMX project-scope 이식 (discuss/report/interview/setup 스킬 4종 + bw-* agent 토톰) |
| `omc/` | `.omc/` | OMC 에이전트 카탈로그 35종 + prompts + skills + state |

## 현재 운영 에이전트

**실가동 에이전트는 `.claude/agents/` 14개**만 사용한다.

- `.claude/agents/` — Claude Code subagent (architect, frontend, backend, dba, devops, designer, developer, planner, devil, qa, finance, marketing, researcher, ops)
- `.claude/commands/` — slash command (discuss, report, interview, setup)

## 복원 방법

필요 시 다시 사용하려면:
```bash
mv archive-meta/codex .codex
mv archive-meta/omc .omc
```
