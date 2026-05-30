import { useQuery } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import client from '../api/client'
import type { Claim } from '../api/types'
import { useAuthStore } from '../store/auth'

export default function RewardsPage() {
  const user = useAuthStore((s) => s.user)

  const { data: claims = [] } = useQuery<Claim[]>({
    queryKey: ['rewards-claims'],
    queryFn: async () => {
      const res = await client.get<{ data: { claims: Claim[] } }>('/rewards/claims')
      return res.data.data.claims
    },
    enabled: !!user,
  })

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

  if (!user) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 pb-nav-safe bg-theme-page lg:max-w-2xl lg:mx-auto">
        <p className="text-theme-muted">로그인이 필요합니다</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-nav-safe pt-6 h-[100dvh] bg-theme-page lg:max-w-2xl lg:mx-auto">
      <h1 className="text-xl font-bold text-theme-primary">Bitcoin 보상 이력</h1>

      {claims.length > 0 ? (
        <div className="space-y-2">
          {claims.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl bg-theme-surface px-4 py-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <Zap size={14} className="text-accent" fill="currentColor" />
                  <span className="text-sm font-semibold text-accent">{c.satoshi_amount.toLocaleString()} sats</span>
                </div>
                <p className="text-xs text-theme-subtle mt-0.5">
                  {new Date(c.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <span className={`text-sm font-semibold ${statusColor[c.status] ?? 'text-theme-muted'}`}>
                {statusLabel[c.status] ?? c.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Zap size={40} className="text-theme-border" />
          <p className="text-sm text-theme-muted">
            Bitcoin 보상 챌린지를 완료하고<br />Claim하면 여기서 확인할 수 있어요
          </p>
        </div>
      )}
    </div>
  )
}
