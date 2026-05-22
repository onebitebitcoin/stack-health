import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Zap, Lock, CheckCircle } from 'lucide-react'
import client from '../api/client'
import type { RewardSummary, Claim } from '../api/types'
import { useAuthStore } from '../store/auth'
import ClaimBottomSheet from '../components/ClaimBottomSheet'

function dDayLabel(deadline: string) {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return 'D-day'
  return `D-${diff}`
}

export default function RewardsPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [showSheet, setShowSheet] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState(false)

  const { data: summary } = useQuery<RewardSummary>({
    queryKey: ['rewards-summary'],
    queryFn: async () => {
      const res = await client.get<{ data: RewardSummary }>('/rewards/summary')
      return res.data.data
    },
  })

  const { data: claims = [] } = useQuery<Claim[]>({
    queryKey: ['rewards-claims'],
    queryFn: async () => {
      const res = await client.get<{ data: Claim[] }>('/rewards/claims')
      return res.data.data
    },
  })

  function handleClaimSuccess() {
    setShowSheet(false)
    setClaimSuccess(true)
    qc.invalidateQueries({ queryKey: ['rewards-summary'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['rewards-claims'] }).catch(() => undefined)
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
    <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-24 pt-6 h-[100dvh] bg-theme-page">
      <h1 className="text-xl font-bold text-theme-primary">리워드</h1>

      {summary && (
        <div className="rounded-2xl bg-theme-surface p-5">
          <div className="mb-1 text-sm text-theme-muted">{summary.week_label} 이번 주 포인트</div>
          <div className="flex items-end gap-2">
            <span className="text-5xl font-black text-theme-primary">{summary.current_week_points}</span>
            <span className="mb-1 text-theme-muted">pt</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-accent">
            <Zap size={16} fill="currentColor" />
            <span className="font-semibold">{summary.satoshi_amount.toLocaleString()} sats</span>
          </div>
          <div className="mt-2 text-sm text-theme-subtle">
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
