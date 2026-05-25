import { useQuery } from '@tanstack/react-query'
import { Plus, Trophy, Users, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import type { Challenge } from '../api/types'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function MyChallengeDashboardPage() {
  const navigate = useNavigate()

  const { data: challenges = [], isLoading, isError } = useQuery<Challenge[]>({
    queryKey: ['my-challenges'],
    queryFn: async () => {
      const res = await client.get<{ data: { challenges: Challenge[] } }>('/challenges/created')
      return res.data.data.challenges
    },
  })

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-theme-primary">내 챌린지</h1>
        <button
          onClick={() => navigate('/challenges/create')}
          className="rounded-full bg-accent p-1.5"
        >
          <Plus size={16} className="text-accent-fg" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : isError ? (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-red-500">데이터를 불러오는 데 실패했습니다.</p>
        </div>
      ) : challenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
          <Trophy size={40} className="text-theme-surface2" strokeWidth={1} />
          <p className="text-sm text-theme-muted">아직 만든 챌린지가 없어요</p>
          <button
            onClick={() => navigate('/challenges/create')}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg"
          >
            챌린지 만들기
          </button>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          {challenges.map((c) => (
            <div key={c.id} className="rounded-2xl bg-theme-surface p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-theme-primary text-sm leading-snug flex-1 min-w-0">
                  {c.title}
                </h3>
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    c.is_active
                      ? 'bg-accent/15 text-accent'
                      : 'bg-theme-surface2 text-theme-muted'
                  }`}
                >
                  {c.is_active ? '활성' : '종료'}
                </span>
              </div>

              <p className="text-xs text-theme-muted mb-3">
                {formatDate(c.start_date)} ~ {formatDate(c.end_date)}
              </p>

              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1 text-xs text-theme-subtle">
                  <Users size={12} />
                  <span>참여자 {c.participant_count}명</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-theme-subtle">
                  <CheckCircle size={12} />
                  <span>완료 {c.completed_count ?? 0}명</span>
                </div>
              </div>

              <button
                onClick={() => navigate(`/challenges/${c.id}/dashboard`)}
                className="w-full rounded-xl border border-accent/40 py-1.5 text-xs font-medium text-accent"
              >
                참여자 보기
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
