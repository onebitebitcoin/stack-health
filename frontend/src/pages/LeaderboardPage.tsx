import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Droplets, Medal, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import client from '../api/client'
import type { LeaderboardEntry, LeaderboardResponse } from '../api/types'
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
    queryKey: ['leaderboard', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
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

  const top3 = isSearching ? [] : entries.slice(0, 3)
  const rest = isSearching ? entries : entries.slice(3)

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Medal size={20} strokeWidth={1.5} className="text-amber-400" />
          <h1 className="text-lg font-bold text-theme-primary">사용자</h1>
        </div>

        {/* 검색 입력 */}
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

          {/* 자동완성 드롭다운 */}
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
                    {entry.total_points.toFixed(1)}pt
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!isSearching && (
          <p className="text-xs text-theme-muted mt-1.5">누적 포인트 기준</p>
        )}
      </div>

      {/* 상위 3인 포디움 (검색 중에는 숨김) */}
      {top3.length > 0 && (
        <div className="mx-4 mb-5 rounded-2xl bg-theme-surface px-4 pt-5 pb-4">
          <div className="flex items-end justify-center gap-3">
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
                  {top3[1].total_points.toFixed(1)}pt
                </div>
                <div className="h-12 w-full rounded-t-lg bg-slate-400/20 flex items-center justify-center text-lg font-bold text-slate-400">
                  2
                </div>
              </div>
            )}
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
                  {top3[0].total_points.toFixed(1)}pt
                </div>
                <div className="h-16 w-full rounded-t-lg bg-amber-400/20 flex items-center justify-center text-xl font-bold text-amber-400">
                  1
                </div>
              </div>
            )}
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
                  {top3[2].total_points.toFixed(1)}pt
                </div>
                <div className="h-8 w-full rounded-t-lg bg-amber-700/20 flex items-center justify-center text-lg font-bold text-amber-700">
                  3
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 목록 */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="text-sm text-theme-muted">불러오는 중...</div>
        </div>
      ) : rest.length > 0 ? (
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
                  <span>{entry.total_points.toFixed(1)}pt</span>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-theme-muted text-sm">
          {isSearching ? '검색 결과가 없습니다' : '아직 사용자 데이터가 없습니다'}
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
