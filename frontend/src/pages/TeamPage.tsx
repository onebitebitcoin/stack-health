import { useNavigate } from 'react-router-dom'
import {
  Building2, Server, Monitor, Database, Container,
  Palette, Code2, Map, ShieldCheck, TrendingUp,
  Megaphone, Wrench, Search, Swords, ChevronLeft,
  type LucideIcon,
} from 'lucide-react'

type AgentCategory = 'build' | 'discuss'

interface Agent {
  name: string
  label: string
  description: string
  tools: string[]
  model: string
  category: AgentCategory
  icon: LucideIcon
}

const AGENTS: Agent[] = [
  {
    name: 'architect',
    label: '아키텍트',
    description: '전체 시스템 설계, 컴포넌트 인터페이스, 기술 결정을 담당하며 각 전문 에이전트에 작업을 분배한다.',
    tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit', 'WebFetch', 'WebSearch'],
    model: 'sonnet',
    category: 'build',
    icon: Building2,
  },
  {
    name: 'backend',
    label: '백엔드',
    description: 'FastAPI + SQLAlchemy + Pydantic 구현을 담당한다. architect의 API 계약을 받아 라우트·서비스·인증 로직을 구현한다.',
    tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit', 'WebFetch'],
    model: 'sonnet',
    category: 'build',
    icon: Server,
  },
  {
    name: 'frontend',
    label: '프론트엔드',
    description: 'React + Vite + TailwindCSS + Zustand + TanStack Query 구현을 담당한다. architect의 설계를 받아 UI 로직과 API 연동을 구현한다.',
    tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit', 'WebFetch'],
    model: 'sonnet',
    category: 'build',
    icon: Monitor,
  },
  {
    name: 'dba',
    label: 'DBA',
    description: 'SQLAlchemy 모델 설계, Alembic 마이그레이션, 쿼리 최적화를 담당한다. architect의 DB 스키마 변경 요청을 받아 실행한다.',
    tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'],
    model: 'sonnet',
    category: 'build',
    icon: Database,
  },
  {
    name: 'devops',
    label: 'DevOps',
    description: 'Docker 빌드, Railway 배포, 환경변수 관리, CI/CD를 담당한다. architect의 인프라 변경 요청을 받아 실행한다.',
    tools: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit', 'WebFetch'],
    model: 'sonnet',
    category: 'build',
    icon: Container,
  },
  {
    name: 'planner',
    label: '기획',
    description: '사업 우선순위, 로드맵 정합성, 범위 관리, 인허가·리스크를 담당하며 SPEC.md 등 기획 문서를 직접 업데이트한다.',
    tools: ['Read', 'Grep', 'WebSearch', 'WebFetch', 'Write', 'Edit', 'Bash', 'Glob'],
    model: 'sonnet',
    category: 'discuss',
    icon: Map,
  },
  {
    name: 'designer',
    label: '디자이너',
    description: '사용자 경험, 브랜드 일관성, 채널별 UX를 담당한다. UX 흐름·컴포넌트 스펙·디자인 시스템을 정의하고 frontend에 전달한다.',
    tools: ['Read', 'WebFetch', 'WebSearch', 'Write', 'Glob', 'Grep'],
    model: 'sonnet',
    category: 'discuss',
    icon: Palette,
  },
  {
    name: 'developer',
    label: '개발자',
    description: '기술 타당성, 구현 난이도, 스택 적합성을 담당한다. 구체적 구현은 전문 에이전트에게 위임한다.',
    tools: ['Read', 'Grep', 'Bash', 'WebFetch', 'Write', 'Edit', 'Glob'],
    model: 'sonnet',
    category: 'discuss',
    icon: Code2,
  },
  {
    name: 'finance',
    label: '재무',
    description: '비용 구조, 원가율(COGS), 매출·이익 시뮬레이션, 손익분기 분석을 담당한다.',
    tools: ['Read', 'Grep', 'WebSearch', 'WebFetch'],
    model: 'sonnet',
    category: 'discuss',
    icon: TrendingUp,
  },
  {
    name: 'marketing',
    label: '마케팅',
    description: '채널 전략, 고객 획득, 가격, 경쟁사 분석을 담당한다.',
    tools: ['Read', 'WebSearch', 'WebFetch', 'Bash'],
    model: 'sonnet',
    category: 'discuss',
    icon: Megaphone,
  },
  {
    name: 'ops',
    label: '운영',
    description: '운영 프로세스 최적화, SOP 설계, 실행 가능성을 담당하며 운영 스크립트와 문서를 직접 작성한다.',
    tools: ['Read', 'Grep', 'Write', 'Edit', 'Bash', 'WebSearch', 'Glob'],
    model: 'sonnet',
    category: 'discuss',
    icon: Wrench,
  },
  {
    name: 'qa',
    label: 'QA',
    description: '검증 지표, 실패 시나리오, 운영 리스크, 테스트 가능성을 담당하며 테스트 코드를 직접 작성한다.',
    tools: ['Read', 'Grep', 'Bash', 'WebSearch', 'Write', 'Edit', 'Glob'],
    model: 'sonnet',
    category: 'discuss',
    icon: ShieldCheck,
  },
  {
    name: 'researcher',
    label: '리서처',
    description: '시장조사, 문헌 정리, 외부 데이터 수집을 담당한다.',
    tools: ['Read', 'WebSearch', 'WebFetch', 'Write'],
    model: 'sonnet',
    category: 'discuss',
    icon: Search,
  },
  {
    name: 'devil',
    label: '악마의 변호인',
    description: '토론에서 합의되고 있는 방향에 비판적 반론을 제시하고, 간과된 리스크·가정·맹점을 드러낸다.',
    tools: ['Read', 'Grep', 'WebSearch', 'WebFetch'],
    model: 'sonnet',
    category: 'discuss',
    icon: Swords,
  },
]

const BUILD_AGENTS = AGENTS.filter((a) => a.category === 'build')
const DISCUSS_AGENTS = AGENTS.filter((a) => a.category === 'discuss')

function AgentCard({ agent }: { agent: Agent }) {
  const Icon = agent.icon
  return (
    <div className="rounded-xl bg-theme-surface px-4 py-3.5 flex flex-col gap-2.5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-theme-surface2">
          <Icon size={16} strokeWidth={1.5} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-theme-primary">{agent.label}</span>
            <span className="text-[10px] font-mono text-theme-subtle">{agent.name}</span>
          </div>
          <p className="mt-0.5 text-xs text-theme-muted leading-relaxed">{agent.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {agent.tools.map((tool) => (
          <span
            key={tool}
            className="rounded-md bg-theme-surface2 px-1.5 py-0.5 text-[10px] font-mono text-theme-subtle"
          >
            {tool}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-theme-subtle">model</span>
        <span className="text-[10px] font-mono text-accent">{agent.model}</span>
      </div>
    </div>
  )
}

export default function TeamPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-[100dvh] bg-theme-page pb-8">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-theme-muted hover:text-theme-primary transition-colors p-1 -ml-1"
          aria-label="뒤로"
        >
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <div>
          <h1 className="text-base font-bold text-theme-primary">팀 구성</h1>
          <p className="text-xs text-theme-muted">AI 에이전트 {AGENTS.length}명</p>
        </div>
      </div>

      <div className="px-4 space-y-6">
        {/* 구현팀 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-medium uppercase tracking-widest text-theme-muted">
              구현팀
            </span>
            <span className="text-[10px] text-theme-subtle">{BUILD_AGENTS.length}명</span>
          </div>
          <div className="space-y-2">
            {BUILD_AGENTS.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        </section>

        {/* 토론팀 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-medium uppercase tracking-widest text-theme-muted">
              토론팀
            </span>
            <span className="text-[10px] text-theme-subtle">{DISCUSS_AGENTS.length}명</span>
          </div>
          <div className="space-y-2">
            {DISCUSS_AGENTS.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
