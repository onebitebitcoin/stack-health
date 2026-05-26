import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Trash2, User, Video, Award, Zap, ChevronDown, ChevronRight, Search, X, Bitcoin, Pickaxe, ArrowLeft, Smartphone, Save, ExternalLink, Upload, FileUp, Loader2 } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import client from '../api/client'
import type { AdminClaim, AdminVideo, AdminWeeklySummaryItem, AdminWeeklySummaryResponse, AdminUsersResponse, MiningParticipant, MiningParticipantsResponse, MiningRound, LotteryResult } from '../api/types'
import { useAuthStore } from '../store/auth'

type TabId = 'users' | 'videos' | 'rewards' | 'app'

interface AdminVideosResponse {
  videos: AdminVideo[]
  total: number
  page: number
  limit: number
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-400',
  paid: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-theme-subtle',
}
const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  paid: '지급완료',
  failed: '실패',
  cancelled: '취소',
}

interface AdminUserDetail {
  user: {
    id: number
    email: string | null
    username: string
    lightning_address: string | null
    is_banned: boolean
    is_admin: boolean
    created_at: string
  }
  videos: { id: number; cdn_url: string; status: string; created_at: string }[]
  challenges: {
    challenge_id: number
    title: string
    upload_count: number
    condition_value: number
    completed: boolean
    joined_at: string
  }[]
  points_by_week: { week_label: string; points: number }[]
  claims: {
    id: number
    week_label: string
    points_used: number
    satoshi_amount: number
    ln_address: string
    status: string
    created_at: string
  }[]
}

function getWeekLabel(offsetWeeks: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetWeeks * 7)
  const year = d.getFullYear()
  const jan4 = new Date(year, 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const diff = d.getTime() - startOfWeek1.getTime()
  const week = Math.floor(diff / (7 * 24 * 3600 * 1000)) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

function UserDetailPanel({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<AdminUserDetail>({
    queryKey: ['admin-user-detail', userId],
    queryFn: async () => {
      const res = await client.get<{ data: AdminUserDetail }>(`/admin/users/${userId}`)
      return res.data.data
    },
  })

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80dvh] overflow-y-auto rounded-2xl bg-theme-page p-4 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading && <p className="text-center text-theme-muted py-8">불러오는 중...</p>}
        {data && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-theme-primary text-lg">@{data.user.username}</p>
                <p className="text-xs text-theme-muted">{data.user.email ?? '이메일 없음'}</p>
              </div>
              <button onClick={onClose} className="text-theme-muted text-sm px-2 py-1">닫기</button>
            </div>

            {data.user.lightning_address && (
              <div className="rounded-xl bg-theme-surface p-3 flex items-center gap-2">
                <Zap size={14} className="text-accent flex-shrink-0" />
                <span className="text-xs text-theme-primary break-all">{data.user.lightning_address}</span>
              </div>
            )}

            {data.points_by_week.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-theme-muted mb-2">주간 포인트</p>
                <div className="space-y-1">
                  {data.points_by_week.map((w) => (
                    <div key={w.week_label} className="flex justify-between text-xs rounded-lg bg-theme-surface px-3 py-2">
                      <span className="text-theme-muted">{w.week_label}</span>
                      <span className="font-semibold text-theme-primary">{w.points}L</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.challenges.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-theme-muted mb-2">챌린지 ({data.challenges.length})</p>
                <div className="space-y-1">
                  {data.challenges.map((c) => (
                    <div key={c.challenge_id} className="flex items-center justify-between text-xs rounded-lg bg-theme-surface px-3 py-2">
                      <span className="text-theme-primary flex-1 min-w-0 truncate">{c.title}</span>
                      <span className="ml-2 text-theme-muted shrink-0">
                        {c.upload_count}/{c.condition_value}{c.completed ? ' ✓' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.claims.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-theme-muted mb-2">클레임 내역</p>
                <div className="space-y-1">
                  {data.claims.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs rounded-lg bg-theme-surface px-3 py-2">
                      <div>
                        <span className="text-theme-muted">{c.week_label}</span>
                        <span className="ml-2 text-theme-primary">{c.satoshi_amount.toLocaleString()} sats</span>
                      </div>
                      <span className={c.status === 'paid' ? 'text-green-400' : 'text-yellow-400'}>{c.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-theme-muted">총 업로드: {data.videos.length}개</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab: TabId = (searchParams.get('tab') as TabId) ?? 'users'
  const [weekOffset, setWeekOffset] = useState(0)
  const [videoPage, setVideoPage] = useState(1)
  const [leaderboardPage, setLeaderboardPage] = useState(1)
  const [leaderboardItems, setLeaderboardItems] = useState<AdminWeeklySummaryItem[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [userPage, setUserPage] = useState(1)
  const [userSearchInput, setUserSearchInput] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const isAdmin = user?.is_admin ?? false

  useEffect(() => {
    const t = setTimeout(() => {
      setUserSearch(userSearchInput)
      setUserPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [userSearchInput])

  const { data: usersData, isLoading: usersLoading, isError: usersError } = useQuery<AdminUsersResponse>({
    queryKey: ['admin-users', userPage, userSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(userPage), limit: '20' })
      if (userSearch) params.set('search', userSearch)
      const res = await client.get<{ data: AdminUsersResponse }>(`/admin/users?${params}`)
      return res.data.data
    },
    enabled: isAdmin && activeTab === 'users',
  })
  const users = usersData?.users ?? []

  const deleteUser = useMutation({
    mutationFn: (id: number) => client.delete(`/admin/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users', userPage, userSearch] }).catch(() => undefined),
  })

  const { data: videosData, isLoading: videosLoading, isError: videosError } = useQuery<AdminVideosResponse>({
    queryKey: ['admin-videos', videoPage],
    queryFn: async () => {
      const res = await client.get<{ data: AdminVideosResponse }>('/admin/videos', {
        params: { page: videoPage, limit: 20 },
      })
      return res.data.data
    },
    enabled: isAdmin && activeTab === 'videos',
  })
  const videos = videosData?.videos ?? []
  const videoTotal = videosData?.total ?? 0
  const videoTotalPages = Math.ceil(videoTotal / 20)

  const deleteVideo = useMutation({
    mutationFn: (id: number) => client.delete(`/admin/videos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-videos'] }).catch(() => undefined),
  })

  const { data: claims = [] } = useQuery<AdminClaim[]>({
    queryKey: ['admin-claims'],
    queryFn: async () => {
      const res = await client.get<{ data: { claims: AdminClaim[] } }>('/admin/claims')
      return res.data.data.claims ?? []
    },
    enabled: isAdmin && activeTab === 'rewards',
  })

  const markPaid = useMutation({
    mutationFn: (id: number) => client.patch(`/admin/claims/${id}/mark-paid`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-claims'] }).catch(() => undefined),
  })

  const { data: leaderboardData } = useQuery<AdminWeeklySummaryResponse>({
    queryKey: ['admin-weekly-summary', weekOffset, leaderboardPage],
    queryFn: async () => {
      const weekLabel = getWeekLabel(weekOffset)
      const res = await client.get<{ data: AdminWeeklySummaryResponse }>('/admin/weekly-summary', {
        params: { week_label: weekLabel, page: leaderboardPage, limit: 20 },
      })
      return res.data.data
    },
    enabled: isAdmin && activeTab === 'rewards',
  })

  useEffect(() => {
    if (!leaderboardData) return
    if (leaderboardPage === 1) {
      setLeaderboardItems(leaderboardData.items)
    } else {
      setLeaderboardItems((prev) => [...prev, ...leaderboardData.items])
    }
  }, [leaderboardData, leaderboardPage])

  if (!isAdmin) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-theme-page">
        <p className="text-theme-muted text-sm">관리자만 접근할 수 있습니다</p>
      </div>
    )
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'users', label: '유저', icon: <User size={14} /> },
    { id: 'videos', label: '영상', icon: <Video size={14} /> },
    { id: 'rewards', label: '리워드', icon: <Award size={14} /> },
    { id: 'app', label: '앱', icon: <Smartphone size={14} /> },
  ]

  return (
    <div className="flex flex-col h-[100dvh] bg-theme-page">
      <div className="flex-none px-4 pt-6 pb-3 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/profile')}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-theme-surface transition-colors"
          >
            <ArrowLeft size={18} strokeWidth={2} className="text-theme-primary" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-theme-primary">Admin</h1>
            <p className="text-xs text-theme-muted">@{user?.username}</p>
          </div>
        </div>

        <div className="flex rounded-xl bg-theme-surface overflow-hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setSearchParams({ tab: tab.id }); setVideoPage(1); setUserSearchInput(''); setUserSearch(''); setUserPage(1) }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id ? 'bg-accent text-accent-fg' : 'text-theme-muted hover:text-theme-primary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">

      {activeTab === 'users' && (
        <div className="space-y-3">
          <div className="sticky top-0 z-10 -mx-4 bg-theme-page px-4 pb-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
              <input
                value={userSearchInput}
                onChange={(e) => setUserSearchInput(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="닉네임, 이메일, Lightning 주소, ID 검색"
                className="w-full rounded-xl border border-theme-border bg-theme-surface py-3 pl-9 pr-9 text-sm text-theme-primary placeholder:text-theme-subtle outline-none focus:border-accent"
              />
              {userSearchInput && (
                <button
                  type="button"
                  onClick={() => { setUserSearchInput(''); setUserSearch('') }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary"
                  aria-label="검색어 지우기"
                >
                  <X size={14} />
                </button>
              )}
              {showSuggestions && users.length > 0 && userSearchInput && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-theme-border bg-theme-surface shadow-lg overflow-hidden">
                  {users.slice(0, 5).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onMouseDown={() => { setUserSearchInput(u.username); setShowSuggestions(false) }}
                      className="w-full px-4 py-2.5 text-left text-sm hover:bg-theme-surface2 flex items-center gap-2"
                    >
                      <span className="font-semibold text-theme-primary">@{u.username}</span>
                      {u.email && <span className="text-xs text-theme-muted truncate">{u.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!usersLoading && !usersError && usersData && (
              <p className="mt-2 text-xs text-theme-muted">
                {userSearch ? `${usersData.total}명 검색됨` : `전체 ${usersData.total}명`}
              </p>
            )}
          </div>

          {usersLoading && <p className="text-center text-theme-muted py-10">불러오는 중...</p>}
          {!usersLoading && usersError && <p className="text-center text-red-400 py-10">조회 실패</p>}
          {!usersLoading && !usersError && users.length === 0 && (
            <p className="text-center text-theme-subtle py-10">{userSearch ? '검색 결과가 없습니다' : '유저가 없습니다'}</p>
          )}
          {users.map((u) => (
            <div key={u.id} className="rounded-xl bg-theme-surface p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-theme-primary">@{u.username}</p>
                    {u.is_admin && (
                      <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">admin</span>
                    )}
                    {u.auth_provider === 'google' && (
                      <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-full">Google</span>
                    )}
                    {u.auth_provider === 'lightning' && (
                      <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded-full">Lightning</span>
                    )}
                    {u.auth_provider === 'email' && (
                      <span className="text-[10px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-full">Email</span>
                    )}
                  </div>
                  <p className="text-xs text-theme-muted">{u.email ?? '이메일 없음'}</p>
                  {u.lightning_address && (
                    <p className="text-xs text-accent mt-0.5 flex items-center gap-1 truncate">
                      <Zap size={10} className="flex-shrink-0" />
                      {u.lightning_address}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-theme-subtle">
                    <span>영상 {u.video_count}개</span>
                    <span>챌린지 {u.challenge_count}개</span>
                    <span>{u.total_points}L</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setSelectedUserId(u.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-theme-surface2 px-3 py-2 text-xs font-semibold text-theme-muted hover:text-theme-primary"
                >
                  <ChevronRight size={12} />
                  상세
                </button>
                <button
                  onClick={() => {
                    if (confirm(`@${u.username} 계정을 삭제하시겠습니까?\n영상, 포인트, 클레임 등 모든 데이터가 삭제됩니다.`))
                      deleteUser.mutate(u.id)
                  }}
                  disabled={deleteUser.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <Trash2 size={12} />
                  삭제
                </button>
              </div>
            </div>
          ))}

          {usersData && (
            <div className="flex items-center justify-between px-2 py-3 text-sm text-theme-muted">
              <button
                disabled={userPage === 1}
                onClick={() => setUserPage(p => p - 1)}
                className="disabled:opacity-40"
              >이전</button>
              <span>페이지 {userPage} / {Math.ceil(usersData.total / 20)}</span>
              <button
                disabled={!usersData.has_next}
                onClick={() => setUserPage(p => p + 1)}
                className="disabled:opacity-40"
              >다음</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'videos' && (
        <div className="space-y-4">
          <div className="px-1">
            <p className="text-xs text-theme-muted">
              {videoTotal > 0 ? `총 ${videoTotal}개 · ${videoPage}/${videoTotalPages} 페이지` : ''}
            </p>
          </div>

          {videosLoading && <p className="text-center text-theme-muted py-10">불러오는 중...</p>}
          {!videosLoading && videosError && <p className="text-center text-red-400 py-10">조회 실패</p>}
          {!videosLoading && !videosError && videos.length === 0 && (
            <p className="text-center text-theme-subtle py-10">영상이 없습니다</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {videos.map((v) => (
              <div key={v.id} className="rounded-xl bg-theme-surface overflow-hidden">
                <div className="relative aspect-[9/16] bg-black">
                  <video
                    src={v.cdn_url}
                    className="w-full h-full object-cover"
                    preload="metadata"
                    muted
                    playsInline
                    onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLVideoElement
                      el.pause()
                      el.currentTime = 0
                    }}
                  />
                  {v.duration_sec != null && (
                    <span className="absolute bottom-2 right-2 text-[10px] font-semibold bg-black/70 text-white px-1.5 py-0.5 rounded">
                      {Math.floor(v.duration_sec / 60)}:{String(v.duration_sec % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <div className="p-2.5 space-y-1.5">
                  <p className="text-xs font-semibold text-theme-primary truncate">@{v.username}</p>
                  <p className="text-[10px] text-theme-subtle">
                    {new Date(v.created_at).toLocaleDateString('ko-KR')}
                  </p>
                  <button
                    onClick={() => {
                      if (confirm('영상을 삭제하시겠습니까?')) deleteVideo.mutate(v.id)
                    }}
                    disabled={deleteVideo.isPending}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    <Trash2 size={12} />
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>

          {videoTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setVideoPage((p) => Math.max(1, p - 1))}
                disabled={videoPage === 1}
                className="rounded-lg bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-muted disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-sm text-theme-muted">{videoPage} / {videoTotalPages}</span>
              <button
                onClick={() => setVideoPage((p) => Math.min(videoTotalPages, p + 1))}
                disabled={videoPage === videoTotalPages}
                className="rounded-lg bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-muted disabled:opacity-40"
              >
                다음
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'rewards' && (
        <>
        <div className="space-y-4">
          <div className="rounded-xl bg-theme-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-theme-primary">주간 리더보드</p>
              <div className="flex gap-1">
                <button
                  onClick={() => { setWeekOffset(0); setLeaderboardPage(1); setLeaderboardItems([]) }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${weekOffset === 0 ? 'bg-accent text-accent-fg' : 'bg-theme-surface2 text-theme-muted'}`}
                >
                  이번 주
                </button>
                <button
                  onClick={() => { setWeekOffset(-1); setLeaderboardPage(1); setLeaderboardItems([]) }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${weekOffset === -1 ? 'bg-accent text-accent-fg' : 'bg-theme-surface2 text-theme-muted'}`}
                >
                  지난 주
                </button>
              </div>
            </div>
            {leaderboardData && (
              <p className="text-xs text-theme-muted">{leaderboardData.week_label} · 총 {leaderboardData.total_users}명</p>
            )}
            {leaderboardItems.length === 0 && (
              <p className="text-center text-theme-subtle py-6">데이터가 없습니다</p>
            )}
            {leaderboardItems.map((item) => (
              <div
                key={item.user_id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  item.rank === 1 ? 'bg-yellow-500/20' : item.rank === 2 ? 'bg-zinc-400/10' : item.rank === 3 ? 'bg-orange-600/10' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-theme-muted w-6 text-right">#{item.rank}</span>
                  <span className="text-sm font-semibold text-theme-primary">@{item.username}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-theme-muted">{item.weekly_points}L</span>
                  <span className="ml-2 text-xs font-semibold text-theme-primary">{item.satoshi_amount.toLocaleString()} sats</span>
                </div>
              </div>
            ))}
            {leaderboardData?.has_next && (
              <button
                onClick={() => setLeaderboardPage((p) => p + 1)}
                className="w-full rounded-lg bg-theme-surface2 py-2 text-sm font-semibold text-theme-muted"
              >
                <ChevronDown size={14} className="inline mr-1" />
                더 보기
              </button>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-theme-primary px-1">클레임 목록</p>
            {claims.length === 0 && <p className="text-center text-theme-subtle py-10">클레임이 없습니다</p>}
            {claims.map((c) => (
              <div key={c.id} className="rounded-xl bg-theme-surface p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-theme-primary">@{c.username}</p>
                    <p className="text-xs text-theme-muted">{c.email}</p>
                    <p className="mt-1 text-sm text-theme-primary">
                      {c.week_label} · {c.points_used}L · {c.satoshi_amount.toLocaleString()} sats
                    </p>
                    <p className="text-xs text-theme-subtle mt-0.5 break-all flex items-center gap-1">
                      <Zap size={10} className="text-accent flex-shrink-0" />
                      {c.ln_address}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${STATUS_COLOR[c.status] ?? 'text-theme-muted'}`}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
                {c.status === 'pending' && (
                  <button
                    onClick={() => markPaid.mutate(c.id)}
                    disabled={markPaid.isPending}
                    className="mt-3 flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <CheckCircle size={14} />
                    지급 완료 처리
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <MiningPanel />
        </>
      )}

      {activeTab === 'app' && <AppLinksPanel />}

      {selectedUserId !== null && (
        <UserDetailPanel userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
      </div>
    </div>
  )
}

interface AppLinksData {
  android_url: string | null
  ios_url: string | null
  android_filename: string | null
  ios_filename: string | null
}

type UploadState = { status: 'idle' } | { status: 'uploading'; progress: number } | { status: 'done' } | { status: 'error'; message: string }

function AppFileUpload({ platform, onUploaded }: { platform: 'android' | 'ios'; onUploaded: () => void }) {
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' })
  const accept = platform === 'android' ? '.apk,application/vnd.android.package-archive' : '.ipa,application/octet-stream'
  const label = platform === 'android' ? 'APK 파일' : 'IPA 파일'

  const handleFile = async (file: File) => {
    setUploadState({ status: 'uploading', progress: 0 })
    try {
      const urlRes = await client.post<{ data: { upload_url: string; cdn_url: string } }>('/admin/app-links/upload-url', {
        platform,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
      })
      const { upload_url, cdn_url } = urlRes.data.data

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadState({ status: 'uploading', progress: Math.round((e.loaded / e.total) * 100) })
          }
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`업로드 실패: ${xhr.status}`)))
        xhr.onerror = () => reject(new Error('네트워크 오류'))
        xhr.open('PUT', upload_url)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.send(file)
      })

      await client.post('/admin/app-links/confirm-upload', {
        platform,
        cdn_url,
        filename: file.name,
      })

      setUploadState({ status: 'done' })
      onUploaded()
      setTimeout(() => setUploadState({ status: 'idle' }), 2000)
    } catch (err: unknown) {
      setUploadState({ status: 'error', message: err instanceof Error ? err.message : '업로드 실패' })
    }
  }

  return (
    <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-theme-border bg-theme-surface2 px-3 py-3 hover:border-accent transition-colors">
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
        disabled={uploadState.status === 'uploading'}
      />
      {uploadState.status === 'uploading' ? (
        <>
          <Loader2 size={14} className="text-accent animate-spin shrink-0" />
          <span className="text-sm text-accent">{uploadState.progress}% 업로드 중...</span>
        </>
      ) : uploadState.status === 'done' ? (
        <>
          <CheckCircle size={14} className="text-green-500 shrink-0" />
          <span className="text-sm text-green-500">업로드 완료</span>
        </>
      ) : uploadState.status === 'error' ? (
        <>
          <X size={14} className="text-red-500 shrink-0" />
          <span className="text-sm text-red-500">{uploadState.message}</span>
        </>
      ) : (
        <>
          <FileUp size={14} className="text-theme-muted shrink-0" />
          <span className="text-sm text-theme-muted">{label} 업로드</span>
        </>
      )}
    </label>
  )
}

function AppLinksPanel() {
  const qc = useQueryClient()
  const [androidUrl, setAndroidUrl] = useState('')
  const [iosUrl, setIosUrl] = useState('')
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery<AppLinksData>({
    queryKey: ['admin-app-links'],
    queryFn: async () => {
      const res = await client.get<{ data: AppLinksData }>('/admin/app-links')
      return res.data.data
    },
  })

  useEffect(() => {
    if (data) {
      setAndroidUrl(data.android_url ?? '')
      setIosUrl(data.ios_url ?? '')
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => client.put('/admin/app-links', {
      android_url: androidUrl.trim() || null,
      ios_url: iosUrl.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-app-links'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-app-links'] })

  if (isLoading) return <p className="text-center text-theme-muted py-10">불러오는 중...</p>

  const androidFilename = data?.android_filename ?? null
  const iosFilename = data?.ios_filename ?? null

  return (
    <div className="space-y-4">
      {/* 파일 업로드 */}
      <div className="rounded-xl bg-theme-surface p-4 space-y-4">
        <p className="text-sm font-semibold text-theme-primary flex items-center gap-2">
          <Upload size={14} className="text-accent" />
          앱 파일 직접 업로드
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-theme-muted mb-1.5 block">Android APK</label>
            {androidFilename && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-[#3DDC84]/10 border border-[#3DDC84]/30">
                <FileUp size={12} className="text-[#3DDC84] shrink-0" />
                <span className="text-xs text-theme-primary truncate">{androidFilename}</span>
              </div>
            )}
            <AppFileUpload platform="android" onUploaded={refresh} />
          </div>
          <div>
            <label className="text-xs text-theme-muted mb-1.5 block">iOS IPA</label>
            {iosFilename && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30">
                <FileUp size={12} className="text-blue-400 shrink-0" />
                <span className="text-xs text-theme-primary truncate">{iosFilename}</span>
              </div>
            )}
            <AppFileUpload platform="ios" onUploaded={refresh} />
          </div>
        </div>
      </div>

      {/* URL 직접 입력 */}
      <div className="rounded-xl bg-theme-surface p-4 space-y-4">
        <p className="text-sm font-semibold text-theme-primary flex items-center gap-2">
          <Smartphone size={14} className="text-accent" />
          스토어 URL 입력 (선택)
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-theme-muted mb-1.5 block">Android (Play Store URL)</label>
            <input
              type="url"
              value={androidUrl}
              onChange={(e) => setAndroidUrl(e.target.value)}
              placeholder="https://play.google.com/store/apps/..."
              className="w-full rounded-xl border border-theme-border bg-theme-surface2 px-3 py-3 text-sm text-theme-primary placeholder:text-theme-subtle outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-theme-muted mb-1.5 block">iOS (TestFlight / App Store URL)</label>
            <input
              type="url"
              value={iosUrl}
              onChange={(e) => setIosUrl(e.target.value)}
              placeholder="https://testflight.apple.com/join/..."
              className="w-full rounded-xl border border-theme-border bg-theme-surface2 px-3 py-3 text-sm text-theme-primary placeholder:text-theme-subtle outline-none focus:border-accent"
            />
          </div>
        </div>

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          <Save size={14} />
          {saved ? '저장됨' : save.isPending ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* 미리보기 */}
      <div className="rounded-xl bg-theme-surface p-4 space-y-3">
        <p className="text-xs font-semibold text-theme-muted">다운로드 버튼 미리보기</p>
        <div className="space-y-2">
          {androidUrl ? (
            <a
              href={androidUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl bg-[#3DDC84]/10 border border-[#3DDC84]/30 px-4 py-3 hover:bg-[#3DDC84]/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#3DDC84]/20 flex items-center justify-center">
                  <Smartphone size={16} className="text-[#3DDC84]" />
                </div>
                <div>
                  <p className="text-xs text-theme-muted">{androidFilename ?? '다운로드'}</p>
                  <p className="text-sm font-semibold text-theme-primary">Android 앱</p>
                </div>
              </div>
              <ExternalLink size={14} className="text-theme-muted" />
            </a>
          ) : (
            <div className="rounded-xl border border-dashed border-theme-border px-4 py-3 text-center">
              <p className="text-xs text-theme-subtle">Android 미설정</p>
            </div>
          )}

          {iosUrl ? (
            <a
              href={iosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl bg-blue-500/10 border border-blue-500/30 px-4 py-3 hover:bg-blue-500/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Smartphone size={16} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-theme-muted">{iosFilename ?? '다운로드'}</p>
                  <p className="text-sm font-semibold text-theme-primary">iPhone 앱</p>
                </div>
              </div>
              <ExternalLink size={14} className="text-theme-muted" />
            </a>
          ) : (
            <div className="rounded-xl border border-dashed border-theme-border px-4 py-3 text-center">
              <p className="text-xs text-theme-subtle">iOS 미설정</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SimResultRow {
  name: string
  points: number
  hashPct: number
  expected: number
  actual: number
  diff: number
  diffPct: number
}

const SIM_NAME_POOL = ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Heidi','Ivan','Judy','Karl','Lisa','Mike','Nina','Oscar','Paul','Quinn','Rose','Sam','Tina']

function MiningPanel() {
  const queryClient = useQueryClient()
  const [weekLabel, setWeekLabel] = useState(() => {
    const d = new Date()
    const jan4 = new Date(d.getFullYear(), 0, 4)
    const startOfWeek = new Date(jan4)
    startOfWeek.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
    const diff = d.getTime() - startOfWeek.getTime()
    const week = Math.floor(diff / (7 * 86400000)) + 1
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
  })
  const [unitSats, setUnitSats] = useState(1008)
  const [lotteryResult, setLotteryResult] = useState<LotteryResult | null>(null)
  const [closeResult, setCloseResult] = useState<{ reduced_user_count: number; claimed_user_count: number } | null>(null)

  // ── Simulation state ──────────────────────────────────────────────────────
  const [simOpen, setSimOpen] = useState(false)
  const [simPool, setSimPool] = useState(10000)
  const [simN, setSimN] = useState(1008)
  const [simTrials, setSimTrials] = useState(1)
  const [simUsers, setSimUsers] = useState([
    { id: 1, name: 'Alice',   points: 150 },
    { id: 2, name: 'Bob',     points: 80  },
    { id: 3, name: 'Charlie', points: 200 },
    { id: 4, name: 'Diana',   points: 120 },
    { id: 5, name: 'Eve',     points: 300 },
  ])
  const [simResult, setSimResult] = useState<SimResultRow[] | null>(null)

  const simRewardPerDraw = Math.floor(simPool / simN)
  const simDividend = simPool % simN
  const simTotalPts = simUsers.reduce((s, u) => s + Math.max(1, u.points), 0)

  function autoFillPoints() {
    setSimUsers(prev => prev.map(u => ({ ...u, points: Math.floor(Math.random() * 480) + 20 })))
    setSimResult(null)
  }

  function setUserCount(n: number) {
    const clamped = Math.max(1, Math.min(20, n))
    setSimUsers(prev => {
      if (clamped > prev.length) {
        const next = [...prev]
        while (next.length < clamped) {
          const idx = next.length
          next.push({ id: Date.now() + idx, name: SIM_NAME_POOL[idx] ?? `User${idx + 1}`, points: Math.floor(Math.random() * 200) + 50 })
        }
        return next
      }
      return prev.slice(0, clamped)
    })
    setSimResult(null)
  }

  function updateSimUser(id: number, field: 'name' | 'points', value: string | number) {
    setSimUsers(prev => prev.map(u => u.id === id ? { ...u, [field]: field === 'points' ? Math.max(1, Number(value)) : value } : u))
    setSimResult(null)
  }

  function runSimulation() {
    const weights = simUsers.map(u => Math.max(1, u.points))
    const total = weights.reduce((a, b) => a + b, 0)
    const rewardPerDraw = Math.floor(simPool / simN)
    const dividend = simPool % simN
    const topIdx = weights.indexOf(Math.max(...weights))

    function pick() {
      const r = Math.random() * total
      let cum = 0
      for (let i = 0; i < weights.length; i++) {
        cum += weights[i]
        if (r < cum) return i
      }
      return weights.length - 1
    }

    const cumulative = new Array(simUsers.length).fill(0)
    for (let t = 0; t < simTrials; t++) {
      const w = new Array(simUsers.length).fill(0)
      for (let d = 0; d < simN; d++) w[pick()] += rewardPerDraw
      // dividend distributed proportionally; dust to top hash-power
      if (dividend > 0) {
        let distributed = 0
        for (let i = 0; i < weights.length; i++) {
          const share = Math.floor(dividend * weights[i] / total)
          w[i] += share
          distributed += share
        }
        w[topIdx] += dividend - distributed
      }
      for (let i = 0; i < simUsers.length; i++) cumulative[i] += w[i]
    }

    setSimResult(
      simUsers.map((u, i) => {
        const actual = cumulative[i] / simTrials
        const expected = simPool * weights[i] / total
        const diff = actual - expected
        return { name: u.name, points: weights[i], hashPct: weights[i] / total * 100, expected, actual, diff, diffPct: expected > 0 ? diff / expected * 100 : 0 }
      }).sort((a, b) => b.actual - a.actual)
    )
  }

  const { data: participantsData, isLoading: loadingParts } = useQuery<{ data: MiningParticipantsResponse }>({
    queryKey: ['mining-participants', weekLabel],
    queryFn: () => client.get(`/admin/mining/participants?week_label=${weekLabel}`).then(r => r.data),
  })

  const { data: roundsData } = useQuery<{ data: { rounds: MiningRound[] } }>({
    queryKey: ['mining-rounds'],
    queryFn: () => client.get('/admin/mining/rounds').then(r => r.data),
  })

  const lotteryMutation = useMutation({
    mutationFn: () => client.post('/admin/mining/run-lottery', { week_label: weekLabel, n: unitSats }).then(r => r.data),
    onSuccess: (res) => {
      setLotteryResult(res.data)
      queryClient.invalidateQueries({ queryKey: ['mining-participants', weekLabel] })
      queryClient.invalidateQueries({ queryKey: ['mining-rounds'] })
    },
  })

  const closeMutation = useMutation({
    mutationFn: () => client.post('/admin/mining/close-week', { week_label: weekLabel }).then(r => r.data),
    onSuccess: (res) => {
      setCloseResult(res.data)
      queryClient.invalidateQueries({ queryKey: ['mining-rounds'] })
    },
  })

  const participants: MiningParticipant[] = participantsData?.data?.participants ?? []
  const totalPool = participantsData?.data?.total_pool_sats ?? 0
  const rounds: MiningRound[] = roundsData?.data?.rounds ?? []

  const ROUND_STATUS: Record<string, string> = { open: '진행중', distributed: '분배완료', closed: '종료' }
  const ROUND_COLOR: Record<string, string> = { open: 'text-yellow-400', distributed: 'text-green-400', closed: 'text-theme-muted' }

  return (
    <div className="space-y-4">
      {/* 주간 설정 */}
      <div className="rounded-xl bg-theme-surface p-4 space-y-3">
        <p className="text-sm font-semibold text-theme-primary flex items-center gap-2">
          <Pickaxe size={14} className="text-accent" />
          마이닝 분배 설정
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-theme-muted mb-1 block">주차</label>
            <input
              type="text"
              value={weekLabel}
              onChange={e => setWeekLabel(e.target.value)}
              className="w-full rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none"
              placeholder="2026-W21"
            />
          </div>
          <div className="w-32">
            <label className="text-xs text-theme-muted mb-1 block">N (드로우 횟수)</label>
            <input
              type="number"
              value={unitSats}
              onChange={e => setUnitSats(Number(e.target.value))}
              className="w-full rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none"
              min={1}
              step={1}
            />
          </div>
        </div>
      </div>

      {/* 해시파워 분포 */}
      <div className="rounded-xl bg-theme-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-theme-primary">해시파워 분포</p>
          <span className="text-xs text-theme-muted">
            {participants.length}명 · {totalPool.toLocaleString()} sats 풀
          </span>
        </div>

        {loadingParts ? (
          <p className="text-xs text-theme-muted text-center py-4">불러오는 중...</p>
        ) : participants.length === 0 ? (
          <p className="text-xs text-theme-subtle text-center py-4">참여자가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {participants.map((p) => (
              <div key={p.claim_id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-theme-primary">@{p.username}</span>
                  <span className="text-theme-muted">
                    {p.points.toFixed(1)}L · {p.hash_power_pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-theme-surface2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${p.hash_power_pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPool > 0 && (
          <p className="text-xs text-theme-muted border-t border-theme-border pt-2">
            N: {unitSats}회 드로우 · 드로우당 보상: {Math.floor(totalPool / unitSats).toLocaleString()} sats · 배당금: {(totalPool % unitSats).toLocaleString()} sats
          </p>
        )}
      </div>

      {/* 복권 실행 */}
      <div className="rounded-xl bg-theme-surface p-4 space-y-3">
        <p className="text-sm font-semibold text-theme-primary">복권 실행</p>
        <p className="text-xs text-theme-muted">
          해시파워 비례 가중 추첨. 더 많은 L = 더 높은 확률. 추첨 횟수가 낮을수록 랜덤성 증가, 높을수록 비례에 가까워짐.
        </p>

        <button
          onClick={() => lotteryMutation.mutate()}
          disabled={lotteryMutation.isPending || participants.length === 0}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          <Bitcoin size={14} />
          {lotteryMutation.isPending ? '실행 중...' : '복권 실행'}
        </button>

        {lotteryMutation.isError && (
          <p className="text-xs text-red-400">{String((lotteryMutation.error as Error)?.message ?? '오류 발생')}</p>
        )}

        {lotteryResult && (
          <div className="rounded-lg bg-theme-surface2 p-3 space-y-1 text-xs">
            <p className="font-semibold text-theme-primary">
              결과: {lotteryResult.winner_count}명 당첨 / {lotteryResult.participant_count}명 참여 · 총 {lotteryResult.total_pool_sats.toLocaleString()} sats
            </p>
            {lotteryResult.results.map((r) => (
              <div key={r.user_id} className="flex items-center justify-between text-theme-muted">
                <span>uid:{r.user_id}</span>
                <span className={r.status === 'paid' ? 'text-green-400' : r.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}>
                  +{r.sats_won.toLocaleString()} sats ({r.status})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 주차 종료 */}
      <div className="rounded-xl bg-theme-surface p-4 space-y-3">
        <p className="text-sm font-semibold text-theme-primary">주차 종료</p>
        <p className="text-xs text-theme-muted">
          미청구 사용자의 주간 포인트를 1/7로 감소시킵니다.
        </p>
        <button
          onClick={() => closeMutation.mutate()}
          disabled={closeMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-red-600/80 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {closeMutation.isPending ? '처리 중...' : '주차 종료'}
        </button>
        {closeResult && (
          <p className="text-xs text-green-400">
            완료: 청구자 {closeResult.claimed_user_count}명 / 미청구 {closeResult.reduced_user_count}명 포인트 1/7 감소
          </p>
        )}
        {closeMutation.isError && (
          <p className="text-xs text-red-400">오류 발생</p>
        )}
      </div>

      {/* 라운드 기록 */}
      {rounds.length > 0 && (
        <div className="rounded-xl bg-theme-surface p-4 space-y-2">
          <p className="text-sm font-semibold text-theme-primary">분배 기록</p>
          {rounds.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg bg-theme-surface2 px-3 py-2 text-xs">
              <div>
                <span className="font-semibold text-theme-primary">{r.week_label}</span>
                <span className="ml-2 text-theme-muted">
                  {r.total_blocks}회 추첨 · {r.participant_count}명 · {r.total_pool_sats.toLocaleString()}sats
                </span>
              </div>
              <span className={`font-semibold ${ROUND_COLOR[r.status] ?? 'text-theme-muted'}`}>
                {ROUND_STATUS[r.status] ?? r.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 시뮬레이션 ───────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-theme-surface overflow-hidden">
        <button
          onClick={() => setSimOpen(v => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-theme-primary hover:bg-theme-surface2 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Pickaxe size={14} className="text-accent" />
            분배 시뮬레이션
          </span>
          {simOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {simOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-theme-border">
            {/* 파라미터 */}
            <div className="pt-3 grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-theme-muted mb-1 block">보상 풀 (sats)</label>
                <input
                  type="number" min={1} step={100}
                  value={simPool}
                  onChange={e => { setSimPool(Number(e.target.value)); setSimResult(null) }}
                  className="w-full rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-theme-muted mb-1 block">N (드로우 횟수)</label>
                <input
                  type="number" min={1} step={1}
                  value={simN}
                  onChange={e => { setSimN(Number(e.target.value)); setSimResult(null) }}
                  className="w-full rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-theme-muted mb-1 block">반복 횟수</label>
                <select
                  value={simTrials}
                  onChange={e => { setSimTrials(Number(e.target.value)); setSimResult(null) }}
                  className="w-full rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none"
                >
                  <option value={1}>1회 (단일)</option>
                  <option value={100}>100회 평균</option>
                  <option value={1000}>1,000회 평균</option>
                  <option value={10000}>10,000회 평균</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-theme-muted">
              드로우당 보상: <span className="text-theme-primary font-semibold">{simRewardPerDraw.toLocaleString()} sats</span>
              &nbsp;·&nbsp;배당금: <span className="text-theme-primary font-semibold">{simDividend.toLocaleString()} sats</span>
              &nbsp;·&nbsp;총 포인트: <span className="text-theme-primary font-semibold">{simTotalPts.toLocaleString()}</span>
            </div>

            {/* 유저 목록 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-theme-muted">유저 수</span>
                  <button onClick={() => setUserCount(simUsers.length - 1)} className="w-6 h-6 rounded bg-theme-surface2 text-theme-primary text-xs hover:bg-theme-border flex items-center justify-center">-</button>
                  <span className="text-sm font-semibold text-theme-primary w-5 text-center">{simUsers.length}</span>
                  <button onClick={() => setUserCount(simUsers.length + 1)} className="w-6 h-6 rounded bg-theme-surface2 text-theme-primary text-xs hover:bg-theme-border flex items-center justify-center">+</button>
                </div>
                <button
                  onClick={autoFillPoints}
                  className="rounded-lg bg-theme-surface2 px-3 py-1.5 text-xs font-semibold text-theme-primary hover:bg-theme-border transition-colors"
                >
                  자동 배정
                </button>
              </div>

              {simUsers.map((u) => {
                const pct = simTotalPts > 0 ? u.points / simTotalPts * 100 : 0
                return (
                  <div key={u.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={u.name}
                      onChange={e => updateSimUser(u.id, 'name', e.target.value)}
                      className="w-20 rounded bg-theme-surface2 px-2 py-1 text-xs text-theme-primary outline-none"
                    />
                    <input
                      type="number" min={1}
                      value={u.points}
                      onChange={e => updateSimUser(u.id, 'points', e.target.value)}
                      className="w-20 rounded bg-theme-surface2 px-2 py-1 text-xs text-theme-primary outline-none"
                    />
                    <div className="flex-1 flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-theme-border overflow-hidden">
                        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-theme-muted w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 실행 버튼 */}
            <button
              onClick={runSimulation}
              disabled={simRewardPerDraw === 0}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-50 w-full justify-center"
            >
              <Bitcoin size={14} />
              시뮬레이션 실행
            </button>

            {/* 결과 */}
            {simResult && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-theme-primary">
                  결과 {simTrials > 1 ? `(${simTrials.toLocaleString()}회 평균)` : '(1회 실행)'}
                </p>
                <div className="rounded-lg bg-theme-surface2 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-theme-border">
                        <th className="px-3 py-2 text-left text-theme-muted font-medium">이름</th>
                        <th className="px-2 py-2 text-right text-theme-muted font-medium">해시%</th>
                        <th className="px-2 py-2 text-right text-theme-muted font-medium">예상</th>
                        <th className="px-2 py-2 text-right text-theme-muted font-medium">실제</th>
                        <th className="px-3 py-2 text-right text-theme-muted font-medium">차이</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simResult.map((row) => (
                        <tr key={row.name} className="border-b border-theme-border last:border-0">
                          <td className="px-3 py-2 font-medium text-theme-primary">{row.name}</td>
                          <td className="px-2 py-2 text-right text-theme-muted">{row.hashPct.toFixed(1)}%</td>
                          <td className="px-2 py-2 text-right text-theme-muted">{Math.round(row.expected).toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-theme-primary font-semibold">{Math.round(row.actual).toLocaleString()}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${row.diff > 0 ? 'text-green-400' : row.diff < 0 ? 'text-red-400' : 'text-theme-muted'}`}>
                            {row.diff >= 0 ? '+' : ''}{Math.round(row.diff).toLocaleString()} ({row.diffPct >= 0 ? '+' : ''}{row.diffPct.toFixed(1)}%)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-theme-muted">
                  총 분배: {Math.round(simResult.reduce((s, r) => s + r.actual, 0)).toLocaleString()} / {simPool.toLocaleString()} sats
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
