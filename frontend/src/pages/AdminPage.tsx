import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Ban, Trash2, User, Video, Award, Zap, ChevronDown, ChevronRight } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import client from '../api/client'
import type { AdminClaim, AdminUser, AdminVideo, AdminWeeklySummaryItem, AdminWeeklySummaryResponse } from '../api/types'
import { useAuthStore } from '../store/auth'

type TabId = 'users' | 'videos' | 'rewards'

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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-theme-page p-4 space-y-4"
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
                      <span className="font-semibold text-theme-primary">{w.points} pt</span>
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
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab: TabId = (searchParams.get('tab') as TabId) ?? 'users'
  const [weekOffset, setWeekOffset] = useState(0)
  const [leaderboardPage, setLeaderboardPage] = useState(1)
  const [leaderboardItems, setLeaderboardItems] = useState<AdminWeeklySummaryItem[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  const isDev = import.meta.env.DEV
  if (!isDev && !user?.is_admin) {
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
  ]

  const statusColor: Record<string, string> = {
    pending: 'text-yellow-400',
    paid: 'text-green-400',
    failed: 'text-red-400',
    cancelled: 'text-theme-subtle',
  }
  const statusLabel: Record<string, string> = {
    pending: '대기',
    paid: '지급완료',
    failed: '실패',
    cancelled: '취소',
  }

  const { data: users = [], isLoading: usersLoading, isError: usersError } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await client.get<{ data: { users: AdminUser[] } }>('/admin/users')
      return res.data.data.users
    },
    enabled: activeTab === 'users',
  })

  const toggleBan = useMutation({
    mutationFn: (id: number) => client.patch(`/admin/users/${id}/ban`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }).catch(() => undefined),
  })

  const { data: videos = [], isLoading: videosLoading, isError: videosError } = useQuery<AdminVideo[]>({
    queryKey: ['admin-videos'],
    queryFn: async () => {
      const res = await client.get<{ data: { videos: AdminVideo[] } }>('/admin/videos')
      return res.data.data.videos
    },
    enabled: activeTab === 'videos',
  })

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
    enabled: activeTab === 'rewards',
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
      if (leaderboardPage === 1) setLeaderboardItems(res.data.data.items)
      else setLeaderboardItems((prev) => [...prev, ...res.data.data.items])
      return res.data.data
    },
    enabled: activeTab === 'rewards',
  })

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-24 pt-6 h-[100dvh] bg-theme-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-theme-primary">Admin</h1>
          <p className="text-xs text-theme-muted">@{user.username}</p>
        </div>
      </div>

      <div className="flex rounded-xl bg-theme-surface overflow-hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSearchParams({ tab: tab.id })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab.id ? 'bg-accent text-accent-fg' : 'text-theme-muted hover:text-theme-primary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <div className="space-y-3">
          {usersLoading && <p className="text-center text-theme-muted py-10">불러오는 중...</p>}
          {!usersLoading && usersError && <p className="text-center text-red-400 py-10">조회 실패</p>}
          {!usersLoading && !usersError && users.length === 0 && (
            <p className="text-center text-theme-subtle py-10">유저가 없습니다</p>
          )}
          {users.map((u) => (
            <div key={u.id} className="rounded-xl bg-theme-surface p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-theme-primary">@{u.username}</p>
                    {u.is_admin && (
                      <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">admin</span>
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
                    <span>{u.total_points} pt</span>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    u.is_banned ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                  }`}
                >
                  {u.is_banned ? '정지됨' : '정상'}
                </span>
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
                  onClick={() => toggleBan.mutate(u.id)}
                  disabled={toggleBan.isPending}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                    u.is_banned ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  }`}
                >
                  <Ban size={12} />
                  {u.is_banned ? '정지 해제' : '정지'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'videos' && (
        <div className="space-y-3">
          {videosLoading && <p className="text-center text-theme-muted py-10">불러오는 중...</p>}
          {!videosLoading && videosError && <p className="text-center text-red-400 py-10">조회 실패</p>}
          {!videosLoading && !videosError && videos.length === 0 && (
            <p className="text-center text-theme-subtle py-10">영상이 없습니다</p>
          )}
          {videos.map((v) => (
            <div key={v.id} className="rounded-xl bg-theme-surface p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-theme-primary">@{v.username}</p>
                  <p className="text-xs text-theme-muted mt-1 truncate">{v.r2_key}</p>
                  <p className="text-xs text-theme-subtle mt-1">
                    {new Date(v.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <span
                  className={`ml-2 shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${
                    v.status === 'active'
                      ? 'bg-green-500/20 text-green-400'
                      : v.status === 'deleted'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-zinc-500/20 text-zinc-400'
                  }`}
                >
                  {v.status}
                </span>
              </div>
              {v.status !== 'deleted' && (
                <button
                  onClick={() => {
                    if (confirm('영상을 삭제하시겠습니까?')) deleteVideo.mutate(v.id)
                  }}
                  disabled={deleteVideo.isPending}
                  className="mt-3 flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  강제 삭제
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'rewards' && (
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
                  <span className="text-xs text-theme-muted">{item.weekly_points} pt</span>
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
                      {c.week_label} · {c.points_used}pt · {c.satoshi_amount.toLocaleString()} sats
                    </p>
                    <p className="text-xs text-theme-subtle mt-0.5 break-all flex items-center gap-1">
                      <Zap size={10} className="text-accent flex-shrink-0" />
                      {c.ln_address}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${statusColor[c.status] ?? 'text-theme-muted'}`}>
                    {statusLabel[c.status] ?? c.status}
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
      )}

      {selectedUserId !== null && (
        <UserDetailPanel userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
    </div>
  )
}
