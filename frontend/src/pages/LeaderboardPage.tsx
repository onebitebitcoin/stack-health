import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Droplets, Users, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'
import type { LeaderboardEntry, LeaderboardResponse } from '../api/types'
import LoadingScreen from '../components/LoadingScreen'

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-white flex-shrink-0">
        1
      </span>
    )
  if (rank === 2)
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-400 text-sm font-bold text-white flex-shrink-0">
        2
      </span>
    )
  if (rank === 3)
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-700 text-sm font-bold text-white flex-shrink-0">
        3
      </span>
    )
  return (
    <span className="flex h-7 w-7 items-center justify-center text-sm font-medium text-theme-subtle flex-shrink-0">
      {rank}
    </span>
  )
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
    staleTime: 60_000,
  })

  const entries = data?.data ?? []
  const isSearching = search.length > 0

  const suggestions = showSuggestions && searchInput.length > 0
    ? entries.slice(0, 5)
    : []

  if (isLoading && page === 1 && !search) return <LoadingScreen />

  if (isError) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-theme-muted text-sm">
        데이터를 불러오지 못했습니다
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">
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
                  <div className="h-7 w-7 rounded-full bg-theme-surface2 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {entry.username[0]?.toUpperCase()}
                  </div>
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
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="text-sm text-theme-muted">불러오는 중...</div>
        </div>
      ) : entries.length > 0 ? (
        <div className="mx-4 rounded-2xl bg-theme-surface overflow-hidden divide-y divide-theme-border">
          {entries.map((entry) => {
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
                  {isMe && <span className="ml-1 text-xs font-normal text-accent/70">(나)</span>}
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
