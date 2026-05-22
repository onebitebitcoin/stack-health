import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import type { LeaderboardResponse, LeaderboardItem } from '../api/types'

const MEDAL = ['🥇', '🥈', '🥉']

function RankRow({ item, isMe }: { item: LeaderboardItem; isMe: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        isMe ? 'bg-accent/10 rounded-xl mx-2' : ''
      }`}
    >
      <div className="w-8 text-center text-sm font-bold">
        {item.rank <= 3 ? (
          <span className="text-base">{MEDAL[item.rank - 1]}</span>
        ) : (
          <span className="text-theme-muted">{item.rank}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isMe ? 'text-accent' : 'text-theme-primary'}`}>
          {item.username}
          {isMe && <span className="ml-1 text-xs text-accent">(나)</span>}
        </p>
        <p className="text-xs text-theme-muted">{item.weekly_points.toLocaleString()} pt</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-theme-primary">
          {item.satoshi_amount.toLocaleString()}
        </p>
        <p className="text-xs text-theme-muted">sats</p>
      </div>
    </div>
  )
}

export default function LeaderboardView() {
  const [week, setWeek] = useState<'current' | 'last'>('current')
  const [page, setPage] = useState(1)
  const [allItems, setAllItems] = useState<LeaderboardItem[]>([])
  const user = useAuthStore((s) => s.user)

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', week, page],
    queryFn: async () => {
      const res = await client.get('/leaderboard', { params: { week, page, limit: 20 } })
      return res.data.data
    },
    staleTime: 60_000,
  })

  // Accumulate items across pages
  const currentPageItems = data?.items ?? []
  const displayItems =
    page === 1 ? currentPageItems : [...allItems.slice(0, (page - 1) * 20), ...currentPageItems]

  function handleWeekChange(w: 'current' | 'last') {
    setWeek(w)
    setPage(1)
    setAllItems([])
  }

  function handleLoadMore() {
    setAllItems(displayItems)
    setPage((p) => p + 1)
  }

  const myId = user?.id
  const myRank = data?.my_rank

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-20">
      {/* Week sub-toggle */}
      <div className="flex items-center gap-1 mx-4 mt-4 mb-3 p-1 bg-theme-surface rounded-xl">
        {(['current', 'last'] as const).map((w) => (
          <button
            key={w}
            onClick={() => handleWeekChange(w)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              week === w
                ? 'bg-accent text-accent-fg shadow-sm'
                : 'text-theme-muted'
            }`}
          >
            {w === 'current' ? '이번 주' : '지난 주'}
          </button>
        ))}
      </div>

      {/* Week label + total users */}
      {data && (
        <div className="px-4 mb-2 flex items-center justify-between">
          <span className="text-xs text-theme-muted">{data.week_label}</span>
          <span className="text-xs text-theme-muted">총 {data.total_users}명 참여</span>
        </div>
      )}

      {/* List */}
      {isLoading && page === 1 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-theme-muted">
          불러오는 중...
        </div>
      ) : displayItems.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16 text-center px-6">
          <Trophy size={36} strokeWidth={1.5} className="text-theme-muted" />
          <p className="text-sm text-theme-muted">이번 주 활동 기록이 없어요</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {displayItems.map((item) => (
            <RankRow key={`${item.user_id}-${item.rank}`} item={item} isMe={item.user_id === myId} />
          ))}

          {/* 더 보기 */}
          {data?.has_next && (
            <button
              onClick={handleLoadMore}
              className="mx-4 mt-2 py-2.5 text-sm font-medium text-accent border border-accent/30 rounded-xl hover:bg-accent/5 transition-colors"
            >
              더 보기
            </button>
          )}

          {/* 내 순위 (top N 밖) */}
          {myRank && (
            <>
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="flex-1 h-px bg-theme-border" />
                <span className="text-xs text-theme-muted">내 순위</span>
                <div className="flex-1 h-px bg-theme-border" />
              </div>
              <RankRow item={myRank} isMe={true} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
