import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOut, Zap, Check, Lock, CheckCircle, ChevronRight, Moon, Sun, Droplets } from 'lucide-react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import { useThemeStore, type Theme } from '../store/theme'
import type { RewardSummary, MyStats } from '../api/types'
import ClaimBottomSheet from '../components/ClaimBottomSheet'
import LoadingScreen from '../components/LoadingScreen'

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

  const { data: summary, isLoading } = useQuery<RewardSummary>({
    queryKey: ['rewards-summary'],
    queryFn: async () => {
      const res = await client.get<{ data: RewardSummary }>('/rewards/summary')
      return res.data.data
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
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 pb-nav-safe bg-theme-page">
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
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">

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

      {/* ── 땀 카드 ── */}
      <div className="mx-4 mb-4 rounded-2xl bg-theme-surface px-6 py-6 flex flex-col items-center gap-1">
        <Droplets size={28} className="text-blue-400 mb-1" strokeWidth={1.5} />
        <span className="text-4xl font-bold font-mono text-theme-primary">
          {(myStats?.total_points ?? 0).toLocaleString()}
          <span className="text-lg font-medium text-theme-muted ml-1">ml</span>
        </span>
        <span className="text-xs text-theme-muted mt-0.5">내가 흘린 땀</span>
      </div>

      {/* ── 리워드 Claim 배너 (claimable일 때만) ── */}
      {summary && summary.claimable && (
        <button
          onClick={() => setShowSheet(true)}
          className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-accent px-4 py-3"
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
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl bg-theme-surface px-4 py-2.5">
          <Lock size={13} className="text-theme-muted flex-shrink-0" />
          <span className="text-xs text-theme-muted">
            {summary.already_claimed
              ? `${summary.week_label} Claim 완료`
              : summary.queued_week_points > 0
                ? `${summary.queued_week_points.toLocaleString()}pt 확정 대기 중 · 업로드 후 24시간`
              : `${(1000 - summary.satoshi_amount).toLocaleString()} sats 더 필요 · ${dDayLabel(summary.deadline)} 마감`}
          </span>
        </div>
      )}

      {/* ── Lightning 주소 ── */}
      <div className="mx-4 mb-4 rounded-xl bg-theme-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-theme-muted flex items-center gap-1.5">
            <Zap size={11} className="text-accent" />
            Lightning 주소
          </span>
          {editingLn ? (
            <form onSubmit={saveLightningAddress} className="flex items-center gap-2">
              <input
                type="text"
                value={lnInput}
                onChange={(e) => setLnInput(e.target.value)}
                placeholder="you@wallet.com"
                autoFocus
                className="bg-transparent text-xs text-theme-primary outline-none text-right min-w-0 w-36"
              />
              <button type="submit" disabled={saving}>
                <Check size={13} className="text-accent" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setEditingLn(true)}
              className="text-xs font-mono text-theme-primary truncate max-w-[180px]"
            >
              {user?.lightning_address ?? '미설정'}
            </button>
          )}
        </div>
      </div>

      {/* ── 앱 설정 ── */}
      <div className="mx-4 mb-4">
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

      {/* ── 이용약관 (중앙 배치) ── */}
      <div className="flex justify-center mt-2 mb-4">
        <Link
          to="/terms"
          className="text-xs text-theme-muted hover:text-theme-primary transition-colors px-4 py-2 rounded-lg bg-theme-surface"
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
