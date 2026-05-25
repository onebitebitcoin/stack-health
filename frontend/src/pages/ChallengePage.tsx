import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Trophy, Users, CheckCircle, Lock, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import type { Challenge } from '../api/types'
import { useAuthStore } from '../store/auth'
import LoginPromptSheet from '../components/LoginPromptSheet'
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function ChallengeCard({
  challenge,
  onJoin,
  joining,
  onLoginRequired,
}: {
  challenge: Challenge
  onJoin: (id: number) => void
  joining: boolean
  onLoginRequired: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const progress = Math.min(
    100,
    Math.round((challenge.my_upload_count / challenge.condition_value) * 100),
  )

  function handleJoin() {
    if (!token) {
      onLoginRequired()
      return
    }
    onJoin(challenge.id)
  }

  return (
    <div className="rounded-2xl bg-theme-surface p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-theme-primary text-sm leading-snug">{challenge.title}</h3>
          <p className="text-xs text-theme-muted mt-0.5 line-clamp-2">{challenge.description}</p>
        </div>
        {challenge.completed ? (
          <CheckCircle size={20} className="text-accent flex-shrink-0 mt-0.5" />
        ) : challenge.joined ? (
          <Lock size={16} className="text-theme-subtle flex-shrink-0 mt-1" />
        ) : null}
      </div>

      {/* 리워드 배지 */}
      <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5">
        <Trophy size={11} className="text-accent" />
        <span className="text-xs font-medium text-accent">{challenge.reward_title}</span>
      </div>

      {/* 카테고리 뱃지 */}
      {challenge.categories?.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {challenge.categories.map((cat) => {
            const label = CATEGORIES.find((c) => c.value === cat)?.label ?? cat
            return (
              <span key={cat} className="rounded-full bg-theme-surface2 px-2 py-0.5 text-[10px] text-theme-muted">
                {label}
              </span>
            )
          })}
        </div>
      )}

      {/* 진행 바 (참여 중일 때) */}
      {challenge.joined && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-theme-muted mb-1">
            <span>{challenge.my_upload_count}/{challenge.condition_value}회 업로드</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-theme-surface2">
            <div
              className="h-1.5 rounded-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-theme-subtle">
          <Users size={12} />
          <span>{challenge.participant_count}명 참여</span>
          <span className="mx-1">·</span>
          <span>~{formatDate(challenge.end_date)}</span>
        </div>

        {challenge.completed ? (
          <span className="text-xs font-semibold text-accent">완료</span>
        ) : challenge.joined ? (
          <span className="text-xs text-theme-subtle">참여 중</span>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg disabled:opacity-60"
          >
            참여하기
          </button>
        )}
      </div>
    </div>
  )
}

export default function ChallengePage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [q, setQ] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [joiningId, setJoiningId] = useState<number | null>(null)
  const [showLogin, setShowLogin] = useState(false)

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

  const joinMutation = useMutation({
    mutationFn: (id: number) => client.post(`/challenges/${id}/join`),
    onMutate: (id) => setJoiningId(id),
    onSettled: () => setJoiningId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges'] }).catch(() => undefined)
    },
  })

  if (isLoading) return <LoadingScreen />

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-20">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-theme-primary">챌린지</h1>
          <p className="text-xs text-theme-muted mt-0.5">운동하고 타이틀을 획득하세요</p>
        </div>
        {user && (
          <button onClick={() => navigate('/challenges/create')} className="rounded-full bg-accent p-1.5">
            <Plus size={16} className="text-accent-fg" />
          </button>
        )}
      </div>

      {/* 카테고리 필터 */}
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

      {/* 챌린지 목록 */}
      {challenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
          <Trophy size={40} className="text-theme-surface2" strokeWidth={1} />
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
              onJoin={(id) => joinMutation.mutate(id)}
              joining={joiningId === c.id}
              onLoginRequired={() => setShowLogin(true)}
            />
          ))}
        </div>
      )}

      {showLogin && <LoginPromptSheet onClose={() => setShowLogin(false)} />}
    </div>
  )
}
