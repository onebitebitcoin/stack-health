import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Ban, Trash2, User, Video, Award } from 'lucide-react'
import axios from 'axios'
import type { AdminClaim, AdminUser, AdminVideo } from '../api/types'
import { THEMES, THEME_LABELS, useThemeStore, type Theme } from '../store/theme'

type TabId = 'users' | 'videos' | 'rewards'

export default function AdminPage() {
  const qc = useQueryClient()
  const [adminKey, setAdminKey] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('rewards')
  const { theme, setTheme } = useThemeStore()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('theme')
    if (t && THEMES.includes(t as Theme)) setTheme(t as Theme)
  }, [setTheme])

  function handleThemeChange(t: Theme) {
    setTheme(t)
    const url = new URL(window.location.href)
    url.searchParams.set('theme', t)
    window.history.replaceState({}, '', url.toString())
  }

  const headers = { 'X-Admin-Key': adminKey }

  // 리워드 탭
  const { data: claims = [], isError: claimsError } = useQuery<AdminClaim[]>({
    queryKey: ['admin-claims', adminKey],
    queryFn: async () => {
      const res = await axios.get<{ data: { claims: AdminClaim[] } }>('/admin/claims', { headers })
      return res.data.data.claims ?? res.data.data ?? []
    },
    enabled: submitted && !!adminKey && activeTab === 'rewards',
  })

  const markPaid = useMutation({
    mutationFn: async (id: number) => {
      await axios.patch(`/admin/claims/${id}/mark-paid`, null, { headers })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-claims'] }).catch(() => undefined),
  })

  // 유저 탭
  const { data: users = [], isError: usersError } = useQuery<AdminUser[]>({
    queryKey: ['admin-users', adminKey],
    queryFn: async () => {
      const res = await axios.get<{ data: { users: AdminUser[] } }>('/admin/users', { headers })
      return res.data.data.users
    },
    enabled: submitted && !!adminKey && activeTab === 'users',
  })

  const toggleBan = useMutation({
    mutationFn: async (id: number) => {
      await axios.patch(`/admin/users/${id}/ban`, null, { headers })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }).catch(() => undefined),
  })

  // 영상 탭
  const { data: videos = [], isError: videosError } = useQuery<AdminVideo[]>({
    queryKey: ['admin-videos', adminKey],
    queryFn: async () => {
      const res = await axios.get<{ data: { videos: AdminVideo[] } }>('/admin/videos', { headers })
      return res.data.data.videos
    },
    enabled: submitted && !!adminKey && activeTab === 'videos',
  })

  const deleteVideo = useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`/admin/videos/${id}`, { headers })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-videos'] }).catch(() => undefined),
  })

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

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-24 pt-6 h-[100dvh] bg-theme-page">
      <h1 className="text-xl font-bold text-theme-primary">Admin</h1>

      {/* 테마 미리보기 */}
      <div className="rounded-xl bg-theme-surface p-4 space-y-2">
        <p className="text-xs font-semibold text-theme-muted uppercase tracking-wide">테마 미리보기</p>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => handleThemeChange(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                theme === t
                  ? 'bg-accent text-accent-fg'
                  : 'bg-theme-surface2 text-theme-muted hover:text-theme-primary'
              }`}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Admin Key 입력 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
        }}
        className="flex gap-2"
      >
        <input
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          placeholder="Admin Key"
          className="flex-1 rounded-lg bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
        />
        <button type="submit" className="rounded-lg bg-accent px-4 py-3 font-semibold text-accent-fg">
          조회
        </button>
      </form>

      {(claimsError || usersError || videosError) && (
        <p className="text-sm text-red-400">인증 실패 또는 조회 오류</p>
      )}

      {/* 탭 네비게이션 */}
      {submitted && (
        <div className="flex rounded-xl bg-theme-surface overflow-hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent text-accent-fg'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* 유저 탭 */}
      {submitted && activeTab === 'users' && (
        <div className="space-y-3">
          {users.length === 0 && (
            <p className="text-center text-theme-subtle py-10">유저가 없습니다</p>
          )}
          {users.map((u) => (
            <div key={u.id} className="rounded-xl bg-theme-surface p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-theme-primary">@{u.username}</p>
                  <p className="text-xs text-theme-muted">{u.email}</p>
                  <p className="text-xs text-theme-subtle mt-1">
                    영상 {u.video_count}개 · {new Date(u.created_at).toLocaleDateString('ko-KR')} 가입
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    u.is_banned ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                  }`}
                >
                  {u.is_banned ? '정지됨' : '정상'}
                </span>
              </div>
              <button
                onClick={() => toggleBan.mutate(u.id)}
                disabled={toggleBan.isPending}
                className={`mt-3 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                  u.is_banned ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                }`}
              >
                <Ban size={14} />
                {u.is_banned ? '정지 해제' : '정지'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 영상 탭 */}
      {submitted && activeTab === 'videos' && (
        <div className="space-y-3">
          {videos.length === 0 && (
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

      {/* 리워드 탭 */}
      {submitted && activeTab === 'rewards' && (
        <div className="space-y-3">
          {claims.length === 0 && (
            <p className="text-center text-theme-subtle py-10">클레임이 없습니다</p>
          )}
          {claims.map((c) => (
            <div key={c.id} className="rounded-xl bg-theme-surface p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-theme-primary">@{c.username}</p>
                  <p className="text-xs text-theme-muted">{c.email}</p>
                  <p className="mt-1 text-sm text-theme-primary">
                    {c.week_label} · {c.points_used}pt · {c.satoshi_amount.toLocaleString()} sats
                  </p>
                  <p className="text-xs text-theme-subtle mt-0.5 break-all">{c.ln_address}</p>
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
      )}
    </div>
  )
}
