import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut, Zap, Check, Lock, CheckCircle, Trash2, ChevronRight, Moon, Sun, Trophy, Video, Flame } from 'lucide-react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import { useThemeStore, type Theme } from '../store/theme'
import type { Post, RewardSummary, Claim, EarnedTitle, MyStats, HistoryResponse } from '../api/types'
import ClaimBottomSheet from '../components/ClaimBottomSheet'
import LoadingScreen from '../components/LoadingScreen'

const statusLabel: Record<string, string> = {
  pending: '검토 중',
  paid: '지급 완료',
  failed: '실패',
  cancelled: '취소',
}
const statusColor: Record<string, string> = {
  pending: 'text-yellow-400',
  paid: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-theme-subtle',
}

function dDayLabel(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  return diff <= 0 ? 'D-day' : `D-${diff}`
}

export default function ProfilePage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const setUser = useAuthStore((s) => s.setUser)

  const { theme, setTheme } = useThemeStore()

  const [editingLn, setEditingLn] = useState(false)
  const [lnInput, setLnInput] = useState(user?.lightning_address ?? '')
  const [saving, setSaving] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const DARK_THEMES: Theme[] = ['volt', 'sapphire', 'indigo']
  const isDark = DARK_THEMES.includes(theme)

  async function handleThemeChange(dark: boolean) {
    const next: Theme = dark ? 'volt' : 'volt-light'
    setTheme(next)
    try {
      const res = await client.patch<{ data: typeof user }>('/auth/me', {
        app_settings: { ...((user?.app_settings ?? {}) as object), theme: next },
      })
      if (res.data.data) setUser(res.data.data)
    } catch {
      // silently ignore — theme is already applied locally
    }
  }

  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: ['my-posts'],
    queryFn: async () => {
      const res = await client.get<{ data: { posts: Post[] } }>('/videos/my-posts')
      return res.data.data.posts
    },
    enabled: !!user,
  })

  const { data: summary } = useQuery<RewardSummary>({
    queryKey: ['rewards-summary'],
    queryFn: async () => {
      const res = await client.get<{ data: RewardSummary }>('/rewards/summary')
      return res.data.data
    },
    enabled: !!user,
  })

  const { data: claims = [] } = useQuery<Claim[]>({
    queryKey: ['rewards-claims'],
    queryFn: async () => {
      const res = await client.get<{ data: { claims: Claim[] } }>('/rewards/claims')
      return res.data.data.claims
    },
    enabled: !!user,
  })

  const { data: titles = [] } = useQuery<EarnedTitle[]>({
    queryKey: ['my-titles'],
    queryFn: async () => {
      const res = await client.get<{ data: { titles: EarnedTitle[] } }>('/challenges/titles')
      return res.data.data.titles
    },
    enabled: !!user,
  })

  const { data: myStats } = useQuery<MyStats>({
    queryKey: ['my-stats'],
    queryFn: async () => {
      const res = await client.get<{ data: MyStats }>('/me/stats')
      return res.data.data
    },
    enabled: !!user,
  })

  const { data: historyData } = useQuery<HistoryResponse>({
    queryKey: ['history-profile'],
    queryFn: async () => {
      const res = await client.get<{ data: HistoryResponse }>('/history')
      return res.data.data
    },
    enabled: !!user,
  })

  const deleteMutation = useMutation({
    mutationFn: (postId: number) => client.delete(`/videos/posts/${postId}`),
    onSuccess: () => {
      setConfirmDeleteId(null)
      qc.invalidateQueries({ queryKey: ['my-posts'] }).catch(() => undefined)
      qc.invalidateQueries({ queryKey: ['feed'] }).catch(() => undefined)
    },
  })

  async function saveLightningAddress(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await client.patch<{ data: typeof user }>('/auth/me', {
        lightning_address: lnInput,
      })
      if (res.data.data) setUser(res.data.data)
      setEditingLn(false)
    } finally {
      setSaving(false)
    }
  }

  function handleClaimSuccess() {
    setShowSheet(false)
    setClaimSuccess(true)
    qc.invalidateQueries({ queryKey: ['rewards-summary'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['rewards-claims'] }).catch(() => undefined)
  }

  if (isLoading) return <LoadingScreen />

  if (claimSuccess) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 pb-16 bg-theme-page">
        <CheckCircle size={64} className="text-accent" />
        <p className="text-xl font-bold text-theme-primary">Claim 완료!</p>
        <p className="text-sm text-theme-muted">24시간 내 지급됩니다</p>
        <button
          onClick={() => setClaimSuccess(false)}
          className="mt-2 rounded-xl bg-theme-surface px-6 py-2.5 text-sm text-theme-primary"
        >
          돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-20">

      {/* ── 헤더 ── */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-theme-surface2 text-sm font-bold text-theme-primary">
          {user?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-theme-primary leading-tight truncate">
            {user?.username}
          </p>
          <p className="text-xs text-theme-muted truncate">{user?.email}</p>
        </div>
        <button
          onClick={() => { logout(); window.location.href = '/login' }}
          className="text-theme-muted hover:text-red-400 transition-colors p-1"
          aria-label="로그아웃"
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* ── 정보 바 (업로드 · sats · lightning) ── */}
      <div className="mx-4 mb-3 flex items-center rounded-xl bg-theme-surface px-3 py-2.5 gap-0">
        {/* 업로드 수 */}
        <div className="flex flex-col items-center flex-1">
          <span className="text-base font-bold font-mono text-theme-primary leading-none">
            {posts.length}
          </span>
          <span className="text-[10px] text-theme-muted mt-0.5">업로드</span>
        </div>

        <div className="w-px h-7 bg-theme-border" />

        {/* 이번 주 sats */}
        <div className="flex flex-col items-center flex-1">
          <span className="text-base font-bold font-mono text-accent leading-none">
            {summary ? summary.satoshi_amount.toLocaleString() : '—'}
          </span>
          <span className="text-[10px] text-theme-muted mt-0.5">이번 주 sats</span>
        </div>

        <div className="w-px h-7 bg-theme-border" />

        {/* Lightning address */}
        <div className="flex flex-col items-center flex-1 min-w-0 px-1">
          {editingLn ? (
            <form
              onSubmit={saveLightningAddress}
              className="flex items-center gap-1 w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={lnInput}
                onChange={(e) => setLnInput(e.target.value)}
                placeholder="you@wallet.com"
                autoFocus
                className="flex-1 min-w-0 bg-transparent text-[10px] text-theme-primary outline-none text-center"
              />
              <button type="submit" disabled={saving}>
                <Check size={12} className="text-accent" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setEditingLn(true)}
              className="flex flex-col items-center w-full"
            >
              <span className="text-[11px] font-mono text-theme-primary truncate max-w-full leading-none">
                {user?.lightning_address
                  ? user.lightning_address.length > 14
                    ? user.lightning_address.slice(0, 12) + '…'
                    : user.lightning_address
                  : '미설정'}
              </span>
              <span className="text-[10px] text-theme-muted mt-0.5 flex items-center gap-0.5">
                <Zap size={9} className="text-accent" />
                lightning
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── 통계 카드 ── */}
      <div className="mx-4 mb-4 grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center rounded-xl bg-theme-surface px-3 py-4">
          <Video size={18} className="mb-1.5 text-theme-muted" strokeWidth={1.5} />
          <span className="text-xl font-bold text-theme-primary">{myStats?.total_posts ?? 0}</span>
          <span className="text-xs text-theme-muted mt-0.5">총 업로드</span>
        </div>
        <div className="flex flex-col items-center rounded-xl bg-theme-surface px-3 py-4">
          <Flame size={18} className="mb-1.5 text-orange-400" strokeWidth={1.5} />
          <span className="text-xl font-bold text-theme-primary">{historyData?.streak ?? 0}</span>
          <span className="text-xs text-theme-muted mt-0.5">연속 일수</span>
        </div>
        <div className="flex flex-col items-center rounded-xl bg-theme-surface px-3 py-4">
          <Zap size={18} className="mb-1.5 text-accent" strokeWidth={1.5} />
          <span className="text-xl font-bold text-theme-primary">{myStats?.total_points ?? 0}</span>
          <span className="text-xs text-theme-muted mt-0.5">총 포인트</span>
        </div>
      </div>

      {/* ── 영상 그리드 ── */}
      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-6">
          <p className="text-sm text-theme-muted">아직 업로드한 영상이 없어요</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px mx-px">
          {posts.map((post) => (
            <div
              key={post.id}
              className="group relative aspect-[9/16] overflow-hidden bg-theme-surface"
            >
              <video
                src={post.cdn_url}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
              {confirmDeleteId === post.id ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75">
                  <p className="text-xs font-semibold text-white">삭제?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => deleteMutation.mutate(post.id)}
                      disabled={deleteMutation.isPending}
                      className="rounded-md bg-red-500 px-3 py-1 text-xs font-bold text-white disabled:opacity-60"
                    >
                      삭제
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-md bg-white/20 px-3 py-1 text-xs text-white"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(post.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 size={12} className="text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 획득한 타이틀 ── */}
      {titles.length > 0 && (
        <div className="mx-4 mt-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-theme-muted px-1 mb-2">
            획득한 타이틀
          </p>
          <div className="flex flex-wrap gap-2">
            {titles.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5"
                title={t.challenge_title}
              >
                <Trophy size={11} className="text-accent" />
                <span className="text-xs font-medium text-accent">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 리워드 Claim 배너 (claimable일 때만) ── */}
      {summary && summary.claimable && (
        <button
          onClick={() => setShowSheet(true)}
          className="mx-4 mt-4 flex items-center justify-between rounded-xl bg-accent px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Zap size={15} fill="var(--accent-fg)" color="var(--accent-fg)" />
            <span className="text-sm font-semibold text-accent-fg">
              {summary.satoshi_amount.toLocaleString()} sats 수령하기
            </span>
          </div>
          <ChevronRight size={16} color="var(--accent-fg)" />
        </button>
      )}

      {/* Claim 불가 상태 작은 안내 */}
      {summary && !summary.claimable && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5">
          <Lock size={13} className="text-theme-muted flex-shrink-0" />
          <span className="text-xs text-theme-muted">
            {summary.already_claimed
              ? `${summary.week_label} Claim 완료`
              : `${(1000 - summary.satoshi_amount).toLocaleString()} sats 더 필요 · ${dDayLabel(summary.deadline)} 마감`}
          </span>
        </div>
      )}

      {/* ── 지급 이력 (있을 때만) ── */}
      {claims.length > 0 && (
        <div className="mx-4 mt-4 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-widest text-theme-muted px-1 mb-1.5">
            지급 이력
          </p>
          {claims.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg bg-theme-surface px-3 py-2"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono text-theme-primary">{c.week_label}</span>
                <span className="text-[10px] text-theme-subtle">
                  {c.satoshi_amount.toLocaleString()} sats
                </span>
              </div>
              <span className={`text-xs font-medium ${statusColor[c.status] ?? 'text-theme-muted'}`}>
                {statusLabel[c.status] ?? c.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 앱 설정 ── */}
      <div className="mx-4 mt-4">
        <p className="text-[10px] font-medium uppercase tracking-widest text-theme-muted px-1 mb-2">
          앱 설정
        </p>
        <div className="flex items-center justify-between rounded-xl bg-theme-surface px-4 py-3">
          <span className="text-xs text-theme-primary">화면 모드</span>
          <div className="flex items-center gap-1 rounded-lg bg-theme-surface2 p-0.5">
            <button
              onClick={() => handleThemeChange(true)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isDark
                  ? 'bg-theme-page text-theme-primary shadow-sm'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
            >
              <Moon size={11} strokeWidth={1.5} />
              다크
            </button>
            <button
              onClick={() => handleThemeChange(false)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                !isDark
                  ? 'bg-theme-page text-theme-primary shadow-sm'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
            >
              <Sun size={11} strokeWidth={1.5} />
              라이트
            </button>
          </div>
        </div>
      </div>

      {/* ── 하단 링크 ── */}
      <div className="mx-4 mt-4 mb-2">
        <Link
          to="/terms"
          className="text-[10px] text-theme-subtle hover:text-theme-muted transition-colors"
        >
          이용약관
        </Link>
      </div>

      {showSheet && summary && (
        <ClaimBottomSheet
          satoshiAmount={summary.satoshi_amount}
          weekLabel={summary.week_label}
          savedAddress={user?.lightning_address ?? null}
          onClose={() => setShowSheet(false)}
          onSuccess={handleClaimSuccess}
        />
      )}
    </div>
  )
}
