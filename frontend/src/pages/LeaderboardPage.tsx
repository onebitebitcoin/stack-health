import { useQuery } from '@tanstack/react-query'
import { Droplets, Medal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'
import type { LeaderboardEntry } from '../api/types'
import LoadingScreen from '../components/LoadingScreen'

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-white">
        1
      </span>
    )
  if (rank === 2)
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-400 text-sm font-bold text-white">
        2
      </span>
    )
  if (rank === 3)
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-700 text-sm font-bold text-white">
        3
      </span>
    )
  return (
    <span className="flex h-7 w-7 items-center justify-center text-sm font-medium text-theme-muted">
      {rank}
    </span>
  )
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)

  const { data, isLoading, isError } = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const res = await client.get<{ data: LeaderboardEntry[] }>('/users/leaderboard')
      return res.data.data
    },
    staleTime: 60_000,
  })

  if (isLoading) return <LoadingScreen />

  if (isError || !data) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-theme-muted text-sm">
        데이터를 불러오지 못했습니다
      </div>
    )
  }

  const top3 = data.slice(0, 3)
  const rest = data.slice(3)

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <Medal size={20} strokeWidth={1.5} className="text-amber-400" />
          <h1 className="text-lg font-bold text-theme-primary">랭킹</h1>
        </div>
        <p className="text-xs text-theme-muted mt-0.5">누적 땀방울 기준</p>
      </div>

      {/* 상위 3인 포디움 */}
      {top3.length > 0 && (
        <div className="mx-4 mb-5 rounded-2xl bg-theme-surface px-4 pt-5 pb-4">
          <div className="flex items-end justify-center gap-3">
            {/* 2위 */}
            {top3[1] && (
              <div className="flex flex-col items-center gap-1.5 flex-1">
                <div className="h-10 w-10 rounded-full bg-slate-400/20 flex items-center justify-center text-lg font-bold text-slate-400">
                  {top3[1].username[0]?.toUpperCase()}
                </div>
                <button
                  onClick={() => navigate(`/users/${top3[1].user_id}`)}
                  className="text-xs font-medium text-theme-primary truncate max-w-[70px] text-center"
                >
                  {top3[1].username}
                </button>
                <div className="flex items-center gap-0.5 text-xs text-theme-muted">
                  <Droplets size={10} className="text-blue-400" />
                  {(top3[1].total_points / 100).toFixed(1)}L
                </div>
                <div className="h-12 w-full rounded-t-lg bg-slate-400/20 flex items-center justify-center text-lg font-bold text-slate-400">
                  2
                </div>
              </div>
            )}
            {/* 1위 */}
            {top3[0] && (
              <div className="flex flex-col items-center gap-1.5 flex-1 -mb-2">
                <span className="text-lg">👑</span>
                <div className="h-12 w-12 rounded-full bg-amber-400/20 flex items-center justify-center text-xl font-bold text-amber-400">
                  {top3[0].username[0]?.toUpperCase()}
                </div>
                <button
                  onClick={() => navigate(`/users/${top3[0].user_id}`)}
                  className="text-xs font-semibold text-theme-primary truncate max-w-[80px] text-center"
                >
                  {top3[0].username}
                </button>
                <div className="flex items-center gap-0.5 text-xs text-theme-muted">
                  <Droplets size={10} className="text-blue-400" />
                  {(top3[0].total_points / 100).toFixed(1)}L
                </div>
                <div className="h-16 w-full rounded-t-lg bg-amber-400/20 flex items-center justify-center text-xl font-bold text-amber-400">
                  1
                </div>
              </div>
            )}
            {/* 3위 */}
            {top3[2] && (
              <div className="flex flex-col items-center gap-1.5 flex-1">
                <div className="h-10 w-10 rounded-full bg-amber-700/20 flex items-center justify-center text-lg font-bold text-amber-700">
                  {top3[2].username[0]?.toUpperCase()}
                </div>
                <button
                  onClick={() => navigate(`/users/${top3[2].user_id}`)}
                  className="text-xs font-medium text-theme-primary truncate max-w-[70px] text-center"
                >
                  {top3[2].username}
                </button>
                <div className="flex items-center gap-0.5 text-xs text-theme-muted">
                  <Droplets size={10} className="text-blue-400" />
                  {(top3[2].total_points / 100).toFixed(1)}L
                </div>
                <div className="h-8 w-full rounded-t-lg bg-amber-700/20 flex items-center justify-center text-lg font-bold text-amber-700">
                  3
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4위~ 목록 */}
      {rest.length > 0 && (
        <div className="mx-4 rounded-2xl bg-theme-surface overflow-hidden divide-y divide-theme-border">
          {rest.map((entry) => {
            const isMe = currentUser?.id === entry.user_id
            return (
              <button
                key={entry.user_id}
                onClick={() => navigate(`/users/${entry.user_id}`)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-theme-surface2 ${isMe ? 'bg-accent/5' : ''}`}
              >
                <RankBadge rank={entry.rank} />
                <div className="h-8 w-8 rounded-full bg-theme-surface2 flex items-center justify-center text-sm font-bold text-theme-primary flex-shrink-0">
                  {entry.username[0]?.toUpperCase()}
                </div>
                <span className={`flex-1 text-sm text-left truncate ${isMe ? 'font-semibold text-accent' : 'text-theme-primary'}`}>
                  {entry.username}
                  {isMe && <span className="ml-1 text-xs">(나)</span>}
                </span>
                <div className="flex items-center gap-1 text-sm text-theme-muted">
                  <Droplets size={12} className="text-blue-400" />
                  <span>{(entry.total_points / 100).toFixed(1)}L</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {data.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-theme-muted text-sm">
          아직 랭킹 데이터가 없습니다
        </div>
      )}
    </div>
  )
}
