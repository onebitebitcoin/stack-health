import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle } from 'lucide-react'
import axios from 'axios'
import type { AdminClaim } from '../api/types'

export default function AdminPage() {
  const qc = useQueryClient()
  const [adminKey, setAdminKey] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const { data: claims = [], isError } = useQuery<AdminClaim[]>({
    queryKey: ['admin-claims', adminKey],
    queryFn: async () => {
      const res = await axios.get<{ data: AdminClaim[] }>('/admin/claims', {
        headers: { 'X-Admin-Key': adminKey },
      })
      return res.data.data
    },
    enabled: submitted && !!adminKey,
  })

  const markPaid = useMutation({
    mutationFn: async (id: number) => {
      await axios.patch(`/admin/claims/${id}/mark-paid`, null, {
        headers: { 'X-Admin-Key': adminKey },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-claims'] }).catch(() => undefined)
    },
  })

  const statusLabel: Record<string, string> = {
    pending: '대기',
    paid: '지급완료',
    failed: '실패',
    cancelled: '취소',
  }
  const statusColor: Record<string, string> = {
    pending: 'text-yellow-400',
    paid: 'text-green-400',
    failed: 'text-red-400',
    cancelled: 'text-zinc-500',
  }

  return (
    <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-24 pt-6 h-[100dvh]">
      <h1 className="text-xl font-bold">Admin</h1>

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
          className="flex-1 rounded-lg bg-zinc-900 px-4 py-3 outline-none focus:ring-2 focus:ring-bitcoin"
        />
        <button
          type="submit"
          className="rounded-lg bg-bitcoin px-4 py-3 font-semibold text-black"
        >
          조회
        </button>
      </form>

      {isError && (
        <p className="text-sm text-red-400">인증 실패 또는 조회 오류</p>
      )}

      {submitted && claims.length === 0 && !isError && (
        <p className="text-center text-zinc-500 py-10">대기 중인 Claim이 없습니다</p>
      )}

      <div className="space-y-3">
        {claims.map((c) => (
          <div key={c.id} className="rounded-xl bg-zinc-900 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">@{c.username}</p>
                <p className="text-xs text-zinc-400">{c.email}</p>
                <p className="mt-1 text-sm">
                  {c.week_label} · {c.points_used}pt · {c.satoshi_amount.toLocaleString()} sats
                </p>
                <p className="text-xs text-zinc-500 mt-0.5 break-all">{c.ln_address}</p>
              </div>
              <span className={`text-sm font-semibold ${statusColor[c.status] ?? 'text-zinc-400'}`}>
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
  )
}
