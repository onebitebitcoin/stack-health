import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Dumbbell, Users, CheckCircle, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
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
      {challenge.image_url && (
        <img
          src={challenge.image_url}
          alt=""
          className="w-24 flex-shrink-0 object-cover self-stretch"
        />
      )}

      <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="font-semibold text-theme-primary text-sm leading-tight truncate">{challenge.title}</h3>
          {challenge.completed ? (
            <CheckCircle size={15} className="text-accent flex-shrink-0" />
          ) : challenge.joined ? (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent flex-shrink-0">참여중</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1 mb-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
            <Dumbbell size={9} className="text-accent" />{challenge.reward_title}
          </span>
          {challenge.categories?.map((cat) => {
            const label = CATEGORIES.find((c) => c.value === cat)?.label ?? cat
            return (
              <span key={cat} className="rounded-full bg-theme-surface2 px-2 py-0.5 text-[10px] text-theme-muted">{label}</span>
            )
          })}
        </div>

        {challenge.joined && (
          <div className="mb-2">
            <div className="flex justify-between text-[10px] text-theme-muted mb-0.5">
              <span>{challenge.my_upload_count}/{challenge.condition_value}회</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-theme-surface2">
              <div className="h-1 rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-auto">
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

  const { data: challenges = [], isLoading } = useQuery<Challenge[]>({
    queryKey: ['challenges', q, selectedCategory],
    queryFn: async () => {
      const res = await client.get<{ data: { challenges: Challenge[] } }>('/challenges', {
        params: {
          ...(q ? { q } : {}),
          ...(selectedCategory ? { category: selectedCategory } : {}),
        },
      })
      return res.data.data.challenges
    },
  })

  if (isLoading) return <LoadingScreen />

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">
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
        </div>
      </div>

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
            {q || selectedCategory ? '검색 결과가 없어요' : '현재 진행 중인 챌린지가 없어요'}
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
