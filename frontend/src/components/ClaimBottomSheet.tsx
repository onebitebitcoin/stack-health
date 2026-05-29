import { useState, type FormEvent } from 'react'
import { Zap, X } from 'lucide-react'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { useAuthStore } from '../store/auth'

interface ClaimBottomSheetProps {
  satoshiAmount: number
  weekLabel: string
  contributionPct: number
  savedAddress: string | null
  onClose: () => void
  onSuccess: () => void
}

export default function ClaimBottomSheet({
  satoshiAmount,
  weekLabel,
  contributionPct,
  savedAddress,
  onClose,
  onSuccess,
}: ClaimBottomSheetProps) {
  const setUser = useAuthStore((s) => s.setUser)
  const user = useAuthStore((s) => s.user)
  const [lnAddress, setLnAddress] = useState(savedAddress ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClaim(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (lnAddress !== savedAddress && user) {
        const meRes = await client.patch<{ data: typeof user }>('/auth/me', {
          lightning_address: lnAddress,
        })
        setUser(meRes.data.data)
      }
      await client.post('/rewards/claim', { week_label: weekLabel, ln_address: lnAddress })
      onSuccess()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Claim 실패'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-theme-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-theme-primary">보상 받기</h2>
          <button onClick={onClose}>
            <X size={20} className="text-theme-muted" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center justify-center rounded-xl bg-theme-surface2 py-4">
            <Zap size={20} className="text-accent mb-1" fill="currentColor" />
            <span className="text-xl font-bold text-accent">{satoshiAmount.toLocaleString()}</span>
            <span className="text-xs text-theme-muted">sats</span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl bg-theme-surface2 py-4">
            <span className="text-xl font-bold text-theme-primary">{contributionPct.toFixed(1)}%</span>
            <span className="text-xs text-theme-muted">기여율</span>
          </div>
        </div>

        <form onSubmit={handleClaim} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm text-theme-muted">Lightning Address</label>
            <input
              type="text"
              value={lnAddress}
              onChange={(e) => setLnAddress(e.target.value)}
              placeholder="you@wallet.com"
              required
              className="w-full rounded-lg bg-theme-surface2 px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !lnAddress}
            className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-60"
          >
            {loading ? '처리 중...' : 'Claim하기'}
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-theme-subtle">
          관리자가 확인 후 24시간 내 지급됩니다
        </p>
      </div>
    </div>
  )
}
