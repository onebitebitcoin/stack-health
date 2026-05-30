import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Dumbbell, Users, CheckCircle, Plus, Droplets } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import { toSweatL } from '../utils/sweat'
import type { Challenge } from '../api/types'
import { useAuthStore } from '../store/auth'
import LoadingScreen from '../components/LoadingScreen'

const CATEGORIES = [
  { value: 'strength', label: '근력' },
  { value: 'cardio', label: '유산소' },
  { value: 'flexibility', label: '유연성' },
  { value: 'diet', label: '식단' },
  { value: 'challenge', label: '도전' },
  { value: 'social', label: '소셜' },
  { value: 'beginner', label: '입문' },
]

function formatMonthDay(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function ChallengeCard({
  challenge,
  onNavigate,
}: {
  challenge: Challenge
  onNavigate: (id: number) => void
}) {
  const progress = Math.min(
    100,
    Math.round((challenge.my_upload_count / challenge.condition_value) * 100),
  )

  return (
    <div
      className="rounded-xl bg-theme-surface cursor-pointer active:opacity-80 overflow-hidden flex"
      onClick={() => onNavigate(challenge.id)}
    >
      {(challenge.image_thumb_url ?? challenge.image_url) ? (
        <img
          src={challenge.image_thumb_url ?? challenge.image_url ?? ''}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-24 flex-shrink-0 object-cover self-stretch"
        />
      ) : (
        <div className="w-24 flex-shrink-0 bg-theme-surface2 self-stretch" />
      )}

      <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col gap-1">
        {/* 제목 + 완료 아이콘 */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-theme-primary text-sm leading-tight truncate">{challenge.title}</h3>
          {challenge.completed && <CheckCircle size={15} className="text-accent flex-shrink-0" />}
        </div>

        {/* 설명 요약 */}
        {challenge.description && (
          <p className="text-[11px] text-theme-muted leading-snug line-clamp-1">{challenge.description}</p>
        )}

        {/* 카테고리 */}
        {challenge.categories?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {challenge.categories.map((cat) => {
              const label = CATEGORIES.find((c) => c.value === cat)?.label ?? cat
              return (
                <span key={cat} className="rounded-full bg-theme-surface2 px-2 py-0.5 text-[10px] text-theme-muted">{label}</span>
              )
            })}
          </div>
        )}

        {/* 진행 바 */}
        {challenge.joined && (
          <div>
            <div className="flex justify-between text-[10px] text-theme-muted mb-0.5">
              <span className="flex items-center gap-0.5">
                <Droplets size={10} className="text-accent" />
                {toSweatL(challenge.my_upload_count)} / {toSweatL(challenge.condition_value)}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-theme-surface2">
              <div className="h-1 rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* 하단 정보 + 버튼 */}
        <div className="flex items-center justify-between mt-auto pt-0.5">
          <div className="flex items-center gap-1 text-[10px] text-theme-subtle">
            <Users size={11} />
            <span>{challenge.participant_count}명</span>
            <span>·</span>
            <span>~{formatMonthDay(challenge.end_date)}</span>
          </div>
          {challenge.completed ? (
            <span className="text-[10px] font-semibold text-accent">완료</span>
          ) : challenge.joined ? (
            <span className="text-[10px] font-semibold text-accent">참여중</span>
          ) : (
            <span className="rounded-lg bg-accent px-2.5 py-1 text-[10px] font-semibold text-accent-fg">
              참여하기
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ChallengePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [q, setQ] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [joinedOnly, setJoinedOnly] = useState(false)

  const { data: challenges = [], isLoading } = useQuery<Challenge[]>({
    queryKey: ['challenges', q, selectedCategory, joinedOnly],
    queryFn: async () => {
      const params: Record<string, string | boolean> = {}
      if (q) params.q = q
      if (selectedCategory) params.category = selectedCategory
      if (joinedOnly) params.joined = true
      const res = await client.get<{ data: { challenges: Challenge[] } }>('/challenges', { params })
      return res.data.data.challenges
    },
  })

  if (isLoading) return <LoadingScreen />

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe lg:max-w-2xl lg:mx-auto">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-theme-primary">챌린지</h1>
          <p className="text-xs text-theme-muted mt-0.5">운동하고 타이틀을 획득하세요</p>
        </div>
        {user && (
          <button
            onClick={() => navigate('/challenges/create')}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
          >
            <Plus size={13} />
            챌린지 추가
          </button>
        )}
      </div>

      {/* 카테고리 + 참여중 필터 */}
      <div className="px-4 mb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('')}
            className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedCategory === ''
                ? 'bg-accent text-accent-fg'
                : 'bg-theme-surface text-theme-muted'
            }`}
          >
            전체
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-accent text-accent-fg'
                  : 'bg-theme-surface text-theme-muted'
              }`}
            >
              {cat.label}
            </button>
          ))}
          {user && (
            <button
              onClick={() => setJoinedOnly((v) => !v)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                joinedOnly
                  ? 'bg-accent text-accent-fg'
                  : 'bg-theme-surface text-theme-muted'
              }`}
            >
              참여중
            </button>
          )}
        </div>
      </div>

      {/* 검색 */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2.5">
          <Search size={16} className="text-theme-subtle flex-shrink-0" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="챌린지 검색..."
            className="flex-1 bg-transparent text-sm text-theme-primary placeholder-theme-subtle outline-none"
          />
        </div>
      </div>

      {challenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
          <Dumbbell size={40} className="text-theme-surface2" strokeWidth={1} />
          <p className="text-sm text-theme-muted">
            {joinedOnly ? '참여 중인 챌린지가 없어요' : q || selectedCategory ? '검색 결과가 없어요' : '현재 진행 중인 챌린지가 없어요'}
          </p>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          {challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              onNavigate={(id) => navigate(`/challenges/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
