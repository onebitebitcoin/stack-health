import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Droplets, Users, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'
import type { LeaderboardEntry, LeaderboardResponse } from '../api/types'
import LoadingScreen from '../components/LoadingScreen'
import UserAvatar from '../components/UserAvatar'
import { SkeletonLeaderboardItem } from '../components/Skeleton'

const RANK_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: 'rgba(255,215,0,0.10)', text: '#FFD700' },
  2: { bg: 'rgba(192,192,192,0.10)', text: '#C0C0C0' },
  3: { bg: 'rgba(205,127,50,0.10)', text: '#CD7F32' },
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard-week', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20', period: 'week' })
      if (search) params.set('search', search)
      const res = await client.get<{ data: LeaderboardEntry[]; total: number; page: number; limit: number; has_next: boolean }>(
        `/users/leaderboard?${params}`
      )
      return res.data as unknown as LeaderboardResponse
    },
  })

  const entries = data?.data ?? []
  const isSearching = search.length > 0

  const suggestions = showSuggestions && searchInput.length > 0
    ? entries.slice(0, 5)
    : []

  if (isLoading && page === 1 && !search) return <LoadingScreen />

  if (isError) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-theme-muted text-sm lg:max-w-2xl lg:mx-auto">
        데이터를 불러오지 못했습니다
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe lg:max-w-2xl lg:mx-auto">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Users size={20} strokeWidth={1.5} className="text-theme-primary" />
          <h1 className="text-lg font-bold text-theme-primary">사용자</h1>
          <span className="ml-auto text-xs text-theme-muted">이번 주 기준</span>
        </div>

        {/* 검색 */}
        <div className="relative">
          <div className="flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2">
            <Search size={16} className="text-theme-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="사용자 검색..."
              className="flex-1 bg-transparent text-sm text-theme-primary placeholder-theme-muted outline-none"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}
                className="text-theme-muted"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* 자동완성 */}
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl bg-theme-surface shadow-lg border border-theme-border overflow-hidden">
              {suggestions.map((entry) => (
                <button
                  key={entry.user_id}
                  onMouseDown={() => {
                    setSearchInput(entry.username)
                    setShowSuggestions(false)
                    navigate(`/users/${entry.user_id}`)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-theme-primary hover:bg-theme-surface2 text-left"
                >
                  <UserAvatar username={entry.username} avatarUrl={entry.avatar_url} size={28} />
                  <span>{entry.username}</span>
                  <span className="ml-auto text-xs text-theme-muted flex items-center gap-0.5">
                    <Droplets size={10} className="text-blue-400" />
                    {entry.total_points.toFixed(1)}L
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 유저 목록 */}
      {isLoading ? (
        <div className="mx-4 rounded-2xl bg-theme-surface overflow-hidden divide-y divide-theme-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonLeaderboardItem key={i} />
          ))}
        </div>
      ) : entries.length > 0 ? (
        <div className="mx-4 rounded-2xl bg-theme-surface overflow-hidden divide-y divide-theme-border">
          {entries.map((entry, idx) => {
            const isMe = currentUser?.id === entry.user_id
            const rank = (page - 1) * 20 + idx + 1
            const rankColor = RANK_COLORS[rank]
            return (
              <button
                key={entry.user_id}
                onClick={() => navigate(`/users/${entry.user_id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-theme-surface2 opacity-0 animate-fade-in-up"
                style={{
                  animationDelay: `${idx * 0.04}s`,
                  backgroundColor: rankColor ? rankColor.bg : isMe ? 'rgba(var(--accent-rgb, 181,255,46), 0.05)' : undefined,
                }}
              >
                <span
                  className="w-5 text-center text-xs font-bold flex-shrink-0"
                  style={{ color: rankColor ? rankColor.text : 'var(--text-muted)' }}
                >
                  {rank}
                </span>
                <UserAvatar username={entry.username} avatarUrl={entry.avatar_url} size={32} />
                <span
                  className={`flex-1 text-sm text-left truncate ${isMe ? 'font-semibold' : ''}`}
                  style={{ color: rankColor ? rankColor.text : isMe ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  {entry.username}
                  {isMe && <span className="ml-1 text-xs font-normal opacity-70">(나)</span>}
                </span>
                <div className="flex items-center gap-1 text-sm text-theme-muted">
                  <Droplets size={12} className="text-blue-400" />
                  <span>{entry.total_points.toFixed(1)}L</span>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-theme-muted text-sm">
          {isSearching ? '검색 결과가 없습니다' : '이번 주 운동 기록이 없습니다'}
        </div>
      )}

      {/* 페이지네이션 */}
      {data && data.total > data.limit && (
        <div className="flex items-center justify-between px-6 py-4 text-sm text-theme-muted">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-theme-surface disabled:opacity-40"
          >
            이전
          </button>
          <span>
            {page} / {Math.ceil(data.total / data.limit)}
          </span>
          <button
            disabled={!data.has_next}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-theme-surface disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}
