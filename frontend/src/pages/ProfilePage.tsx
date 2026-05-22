import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut, Zap, Edit2, Check, Lock, CheckCircle, Trash2 } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import type { Post, RewardSummary, Claim } from '../api/types'
import ClaimBottomSheet from '../components/ClaimBottomSheet'
import LoadingScreen from '../components/LoadingScreen'

interface ProfileData {
  posts: Post[]
  total_points: number
}

function dDayLabel(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return 'D-day'
  return `D-${diff}`
}

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

export default function ProfilePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const setUser = useAuthStore((s) => s.setUser)

  const [editingLn, setEditingLn] = useState(false)
  const [lnInput, setLnInput] = useState(user?.lightning_address ?? '')
  const [saving, setSaving] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (postId: number) => client.delete(`/videos/posts/${postId}`),
    onSuccess: () => {
      setConfirmDeleteId(null)
      qc.invalidateQueries({ queryKey: ['profile'] }).catch(() => undefined)
      qc.invalidateQueries({ queryKey: ['feed'] }).catch(() => undefined)
    },
  })

  const { data, isLoading: profileLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: async () => {
      const [postsRes, summaryRes] = await Promise.all([
        client.get<{ data: { posts: Post[]; next_cursor: number | null } }>('/feed', {
          params: { limit: 20 },
        }),
        client.get<{ data: { current_week_points: number } }>('/rewards/summary'),
      ])
      return {
        posts: postsRes.data.data.posts.filter((p) => p.user_id === user?.id),
        total_points: summaryRes.data.data.current_week_points,
      }
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
      const res = await client.get<{ data: Claim[] }>('/rewards/claims')
      return res.data.data
    },
    enabled: !!user,
  })

  function handleClaimSuccess() {
    setShowSheet(false)
    setClaimSuccess(true)
    qc.invalidateQueries({ queryKey: ['rewards-summary'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['rewards-claims'] }).catch(() => undefined)
  }

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

  function handleLogout() {
    logout()
    navigate('/login')
  }

  if (profileLoading) return <LoadingScreen />

  if (claimSuccess) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 pb-16 bg-theme-page">
        <CheckCircle size={72} className="text-accent" />
        <p className="text-2xl font-bold text-theme-primary">Claim 완료!</p>
        <p className="text-theme-muted">24시간 내 지급됩니다</p>
        <button
          onClick={() => setClaimSuccess(false)}
          className="mt-4 rounded-xl bg-theme-surface2 px-6 py-3 text-sm text-theme-primary"
        >
          돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-24 pt-6 h-[100dvh] bg-theme-page">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-theme-surface2 text-2xl font-bold text-theme-primary">
          {user?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <p className="font-bold text-theme-primary">{user?.username}</p>
          <p className="text-sm text-theme-muted">{user?.email}</p>
        </div>
      </div>

      {/* 통계 */}
      {data && (
        <div className="flex gap-4">
          <div className="flex-1 rounded-xl bg-theme-surface px-4 py-3 text-center">
            <p className="text-2xl font-bold text-theme-primary">{data.posts.length}</p>
            <p className="text-xs text-theme-muted">업로드</p>
          </div>
          <div className="flex-1 rounded-xl bg-theme-surface px-4 py-3 text-center">
            <p className="text-2xl font-bold text-accent">{data.total_points}</p>
            <p className="text-xs text-theme-muted">이번 주 pt</p>
          </div>
        </div>
      )}

      {/* 내 영상 그리드 */}
      {data && data.posts.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {data.posts.map((post) => (
            <div key={post.id} className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-theme-surface">
              <video
                src={post.cdn_url}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />

              {confirmDeleteId === post.id ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                  <p className="text-xs font-semibold text-white">삭제할까요?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => deleteMutation.mutate(post.id)}
                      disabled={deleteMutation.isPending}
                      className="rounded-lg bg-red-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      삭제
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-lg bg-white/20 px-3 py-1 text-xs text-white"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(post.id)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="삭제"
                >
                  <Trash2 size={14} className="text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 리워드 섹션 */}
      {summary && (
        <div className="rounded-2xl bg-theme-surface p-5">
          <h2 className="mb-3 font-semibold text-theme-primary flex items-center gap-2">
            <Zap size={16} className="text-accent" />
            리워드
          </h2>
          <div className="mb-1 text-sm text-theme-muted">{summary.week_label} 이번 주 포인트</div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-black text-theme-primary">{summary.current_week_points}</span>
            <span className="mb-1 text-theme-muted">pt</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-accent">
            <Zap size={14} fill="currentColor" />
            <span className="text-sm font-semibold">{summary.satoshi_amount.toLocaleString()} sats</span>
          </div>
          <div className="mt-1 text-xs text-theme-subtle">
            마감 {dDayLabel(summary.deadline)} · {new Date(summary.deadline).toLocaleDateString('ko-KR')}
          </div>
          <button
            onClick={() => setShowSheet(true)}
            disabled={!summary.claimable}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-opacity ${
              summary.claimable
                ? 'bg-accent text-accent-fg'
                : 'cursor-not-allowed bg-theme-surface2 text-theme-subtle'
            }`}
          >
            {!summary.claimable && <Lock size={16} />}
            {summary.already_claimed
              ? '이미 Claim됨'
              : summary.satoshi_amount < 1000
                ? `${1000 - summary.satoshi_amount} sats 더 필요`
                : 'Claim하기'}
          </button>
        </div>
      )}

      {/* 지급 이력 */}
      {claims.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold text-theme-muted">지급 이력</h2>
          <div className="space-y-2">
            {claims.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl bg-theme-surface px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-theme-primary">{c.week_label}</p>
                  <p className="text-xs text-theme-subtle">
                    {c.points_used}pt · {c.satoshi_amount.toLocaleString()} sats
                  </p>
                </div>
                <span className={`text-sm font-semibold ${statusColor[c.status] ?? 'text-theme-muted'}`}>
                  {statusLabel[c.status] ?? c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 설정 */}
      <div className="rounded-2xl bg-theme-surface p-4 space-y-3">
        <p className="font-semibold text-theme-muted">설정</p>

        <div className="space-y-1">
          <p className="text-sm text-theme-muted">Lightning Address</p>
          {editingLn ? (
            <form onSubmit={saveLightningAddress} className="flex gap-2">
              <input
                type="text"
                value={lnInput}
                onChange={(e) => setLnInput(e.target.value)}
                placeholder="you@wallet.com"
                className="flex-1 rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-2 text-accent-fg"
              >
                <Check size={16} />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-accent flex-shrink-0" />
              <span className="flex-1 text-sm text-theme-primary truncate">
                {user?.lightning_address ?? '미설정'}
              </span>
              <button onClick={() => setEditingLn(true)}>
                <Edit2 size={14} className="text-theme-muted" />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-xl bg-theme-surface2 px-4 py-3 text-sm text-red-400 transition-colors hover:opacity-80"
        >
          <LogOut size={16} />
          로그아웃
        </button>

        <Link to="/terms" className="text-xs text-theme-subtle hover:text-theme-muted">이용약관</Link>
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
