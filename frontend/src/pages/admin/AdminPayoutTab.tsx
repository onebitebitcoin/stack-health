import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, XCircle, Zap } from 'lucide-react'
import client from '../../api/client'
import { getApiErrorMessage } from '../../api/errors'

interface PayoutStatusResponse {
  dummy: boolean
  max_test_sats: number
}

interface PayoutResult {
  ln_address: string
  amount_sats: number
}

interface PayoutRequestPayload {
  ln_address: string
  amount_sats: number
  memo: string | null
}

interface PayoutOutcome {
  lnAddress: string
  amountSats: number
}

interface PayoutFailure {
  message: string
}

const LN_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MEMO_MAX_LENGTH = 100

function formatSats(value: number): string {
  return value.toLocaleString('en-US')
}

export default function AdminPayoutTab() {
  const { t } = useTranslation('admin')
  const qc = useQueryClient()

  const [lnAddress, setLnAddress] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [memo, setMemo] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ address?: string; amount?: string; memo?: string }>({})
  const [confirmPayload, setConfirmPayload] = useState<PayoutRequestPayload | null>(null)
  const [outcome, setOutcome] = useState<PayoutOutcome | null>(null)
  const [failure, setFailure] = useState<PayoutFailure | null>(null)

  const {
    data: statusData,
    isLoading: statusLoading,
    isError: statusError,
  } = useQuery<PayoutStatusResponse>({
    queryKey: ['admin-payout-status'],
    queryFn: async () => {
      const res = await client.get<{ data: PayoutStatusResponse }>('/admin/blink/status')
      return res.data.data
    },
  })

  const testPayout = useMutation({
    mutationFn: async (payload: PayoutRequestPayload) => {
      const res = await client.post<{ data: PayoutResult }>('/admin/blink/test-payout', payload)
      return res.data.data
    },
    onSuccess: (data) => {
      setOutcome({ lnAddress: data.ln_address, amountSats: data.amount_sats })
      setFailure(null)
      setConfirmPayload(null)
      qc.invalidateQueries({ queryKey: ['admin-payout-status'] })
    },
    onError: (err) => {
      setFailure({ message: getApiErrorMessage(err, t('payoutErrorFallback')) })
      setOutcome(null)
      setConfirmPayload(null)
    },
  })

  const maxTestSats = statusData?.max_test_sats ?? 0
  const canAttemptSubmit = !testPayout.isPending && lnAddress.trim() !== '' && amountInput.trim() !== ''

  function validate(): PayoutRequestPayload | null {
    const trimmedAddress = lnAddress.trim()
    const trimmedMemo = memo.trim()
    const errors: { address?: string; amount?: string; memo?: string } = {}

    if (!trimmedAddress) {
      errors.address = t('payoutAddressRequired')
    } else if (!LN_ADDRESS_RE.test(trimmedAddress)) {
      errors.address = t('payoutAddressInvalid')
    }

    const amountValue = Number(amountInput)
    if (!amountInput.trim()) {
      errors.amount = t('payoutAmountRequired')
    } else if (!Number.isInteger(amountValue) || amountValue < 1) {
      errors.amount = t('payoutAmountInvalid')
    } else if (amountValue > maxTestSats) {
      errors.amount = t('payoutAmountExceedsMax', { max: formatSats(maxTestSats) })
    }

    if (trimmedMemo.length > MEMO_MAX_LENGTH) {
      errors.memo = t('payoutMemoTooLong')
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return null

    return {
      ln_address: trimmedAddress,
      amount_sats: amountValue,
      memo: trimmedMemo || null,
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = validate()
    if (!payload) return
    setOutcome(null)
    setFailure(null)
    setConfirmPayload(payload)
  }

  function handleConfirm() {
    if (!confirmPayload || testPayout.isPending) return
    testPayout.mutate(confirmPayload)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-theme-surface p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={15} className="text-lightning" />
          <p className="text-body font-semibold text-theme-primary">{t('tabPayout')}</p>
        </div>

        <div className="flex items-start gap-2 rounded-card bg-warning/10 px-3 py-2 text-label text-warning">
          <AlertTriangle size={14} className="mt-1 shrink-0" />
          <span>{t('payoutDummyNotice')}</span>
        </div>
        {statusLoading && <p className="mt-2 text-label text-theme-muted">{t('loading')}</p>}
        {!statusLoading && statusError && <p className="mt-2 text-label text-danger">{t('loadFailed')}</p>}
        {statusData && <p className="mt-2 text-label text-theme-muted">{t('payoutMaxHint', { max: formatSats(statusData.max_test_sats) })}</p>}
      </div>

      <form onSubmit={handleSubmit} noValidate className="rounded-card bg-theme-surface p-4 space-y-4">
        <div>
          <label className="block text-label text-theme-muted mb-1">{t('payoutAddressLabel')}</label>
          <input
            type="text"
            value={lnAddress}
            onChange={(e) => { setLnAddress(e.target.value); setFieldErrors((f) => ({ ...f, address: undefined })) }}
            placeholder={t('payoutAddressPlaceholder')}
            disabled={testPayout.isPending}
            className="w-full rounded-card border border-theme-border bg-theme-surface2 px-4 py-3 text-body font-mono text-theme-primary placeholder:text-theme-muted outline-none focus:border-accent disabled:opacity-50"
          />
          {fieldErrors.address && <p className="mt-1 text-label text-danger">{fieldErrors.address}</p>}
        </div>

        <div>
          <label className="block text-label text-theme-muted mb-1">{t('payoutAmountLabel')}</label>
          <input
            type="number"
            value={amountInput}
            onChange={(e) => { setAmountInput(e.target.value); setFieldErrors((f) => ({ ...f, amount: undefined })) }}
            placeholder={t('payoutAmountPlaceholder')}
            disabled={testPayout.isPending}
            className="w-full rounded-card border border-theme-border bg-theme-surface2 px-4 py-3 text-body text-theme-primary placeholder:text-theme-muted outline-none focus:border-accent disabled:opacity-50"
          />
          {fieldErrors.amount && <p className="mt-1 text-label text-danger">{fieldErrors.amount}</p>}
        </div>

        <div>
          <label className="block text-label text-theme-muted mb-1">{t('payoutMemoLabel')}</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => { setMemo(e.target.value); setFieldErrors((f) => ({ ...f, memo: undefined })) }}
            placeholder={t('payoutMemoPlaceholder')}
            maxLength={MEMO_MAX_LENGTH}
            disabled={testPayout.isPending}
            className="w-full rounded-card border border-theme-border bg-theme-surface2 px-4 py-3 text-body text-theme-primary placeholder:text-theme-muted outline-none focus:border-accent disabled:opacity-50"
          />
          <div className="mt-1 flex items-center justify-between">
            {fieldErrors.memo ? <p className="text-label text-danger">{fieldErrors.memo}</p> : <span />}
            <p className="text-label text-theme-muted">{t('payoutMemoCount', { count: memo.length })}</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canAttemptSubmit}
          className="w-full rounded-card bg-accent py-3 text-body font-semibold text-accent-fg disabled:opacity-50"
        >
          {testPayout.isPending ? t('payoutSubmitting') : t('payoutSubmitButton')}
        </button>
      </form>

      {outcome && (
        <div className="flex items-start gap-2 rounded-card bg-success/10 px-4 py-3 text-label text-success">
          <CheckCircle2 size={16} className="mt-1 shrink-0" />
          <div>
            <p className="font-semibold">{t('payoutResultDummyTitle')}</p>
            <p>{t('payoutResultDummyBody', { address: outcome.lnAddress, amount: formatSats(outcome.amountSats) })}</p>
          </div>
        </div>
      )}

      {failure && (
        <div className="flex items-start gap-2 rounded-card bg-danger/10 px-4 py-3 text-label text-danger">
          <XCircle size={16} className="mt-1 shrink-0" />
          <p>{failure.message}</p>
        </div>
      )}

      {confirmPayload && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!testPayout.isPending) setConfirmPayload(null) }}>
          <div className="w-full max-w-lg rounded-card bg-theme-surface px-6 pt-5 pb-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-title text-theme-primary mb-1">{t('payoutConfirmTitle')}</p>
            <p className="text-body text-theme-muted mb-5">
              {t('payoutConfirmBody', { address: confirmPayload.ln_address, amount: formatSats(confirmPayload.amount_sats) })}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmPayload(null)}
                disabled={testPayout.isPending}
                className="flex-1 rounded-card bg-theme-surface2 py-3 text-body text-theme-muted disabled:opacity-60"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={testPayout.isPending}
                className="flex-1 rounded-card bg-accent py-3 text-body font-semibold text-accent-fg disabled:opacity-60"
              >
                {testPayout.isPending ? t('payoutSubmitting') : t('payoutConfirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
