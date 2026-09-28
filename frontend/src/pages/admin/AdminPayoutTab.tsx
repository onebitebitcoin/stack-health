import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Clock, Info, XCircle, Zap } from 'lucide-react'
import client from '../../api/client'
import { getApiErrorMessage } from '../../api/errors'

interface BlinkStatus {
  configured: boolean
  wallet_id: string | null
  balance_sats: number | null
  max_test_sats: number
  error: string | null
}

type PayoutStatus = 'SUCCESS' | 'PENDING' | 'FAILURE' | 'ALREADY_PAID'

interface PayoutResult {
  status: PayoutStatus
  ln_address: string
  amount_sats: number
}

interface PayoutRequestPayload {
  ln_address: string
  amount_sats: number
  memo: string | null
}

interface PayoutOutcome {
  status: PayoutStatus
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
  } = useQuery<BlinkStatus>({
    queryKey: ['admin-blink-status'],
    queryFn: async () => {
      const res = await client.get<{ data: BlinkStatus }>('/admin/blink/status')
      return res.data.data
    },
  })

  const testPayout = useMutation({
    mutationFn: async (payload: PayoutRequestPayload) => {
      const res = await client.post<{ data: PayoutResult }>('/admin/blink/test-payout', payload)
      return res.data.data
    },
    onSuccess: (data) => {
      setOutcome({ status: data.status, lnAddress: data.ln_address, amountSats: data.amount_sats })
      setFailure(null)
      setConfirmPayload(null)
      qc.invalidateQueries({ queryKey: ['admin-blink-status'] })
    },
    onError: (err) => {
      setFailure({ message: getApiErrorMessage(err, t('payoutErrorFallback')) })
      setOutcome(null)
      setConfirmPayload(null)
    },
  })

  const configured = statusData?.configured ?? false
  const maxTestSats = statusData?.max_test_sats ?? 0
  const canAttemptSubmit = configured && !testPayout.isPending && lnAddress.trim() !== '' && amountInput.trim() !== ''

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

  const outcomeMeta: Record<PayoutStatus, { icon: React.ReactNode; colorClass: string; titleKey: string; bodyKey: string }> = {
    SUCCESS: { icon: <CheckCircle2 size={16} />, colorClass: 'bg-success/10 text-success', titleKey: 'payoutResultSuccessTitle', bodyKey: 'payoutResultSuccessBody' },
    PENDING: { icon: <Clock size={16} />, colorClass: 'bg-warning/10 text-warning', titleKey: 'payoutResultPendingTitle', bodyKey: 'payoutResultPendingBody' },
    ALREADY_PAID: { icon: <Info size={16} />, colorClass: 'bg-accent/10 text-accent', titleKey: 'payoutResultAlreadyPaidTitle', bodyKey: 'payoutResultAlreadyPaidBody' },
    FAILURE: { icon: <XCircle size={16} />, colorClass: 'bg-danger/10 text-danger', titleKey: 'payoutResultFailureTitle', bodyKey: 'payoutResultFailureBody' },
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-theme-surface p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={15} className="text-lightning" />
          <p className="text-body font-semibold text-theme-primary">{t('tabPayout')}</p>
        </div>

        {statusLoading && <p className="text-label text-theme-muted">{t('loading')}</p>}
        {!statusLoading && statusError && <p className="text-label text-danger">{t('loadFailed')}</p>}

        {!statusLoading && !statusError && statusData && (
          <div className="space-y-2">
            {!statusData.configured && (
              <div className="flex items-start gap-2 rounded-card bg-warning/10 px-3 py-2 text-label text-warning">
                <AlertTriangle size={14} className="mt-1 shrink-0" />
                <span>{t('payoutNotConfigured')}</span>
              </div>
            )}
            {statusData.configured && statusData.error && (
              <div className="flex items-start gap-2 rounded-card bg-danger/10 px-3 py-2 text-label text-danger">
                <AlertTriangle size={14} className="mt-1 shrink-0" />
                <span>{t('payoutStatusErrorPrefix', { message: statusData.error })}</span>
              </div>
            )}
            {statusData.configured && !statusData.error && (
              <div className="text-label text-theme-muted">
                {statusData.balance_sats !== null
                  ? <p className="text-body font-semibold text-theme-primary">{t('payoutWalletBalance', { balance: formatSats(statusData.balance_sats) })}</p>
                  : <p>{t('payoutBalanceUnavailable')}</p>
                }
                {statusData.wallet_id && <p className="font-mono">{t('payoutWalletId', { walletId: statusData.wallet_id })}</p>}
                <p>{t('payoutMaxHint', { max: formatSats(statusData.max_test_sats) })}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="rounded-card bg-theme-surface p-4 space-y-4">
        <div>
          <label className="block text-label text-theme-muted mb-1">{t('payoutAddressLabel')}</label>
          <input
            type="text"
            value={lnAddress}
            onChange={(e) => { setLnAddress(e.target.value); setFieldErrors((f) => ({ ...f, address: undefined })) }}
            placeholder={t('payoutAddressPlaceholder')}
            disabled={!configured || testPayout.isPending}
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
            disabled={!configured || testPayout.isPending}
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
            disabled={!configured || testPayout.isPending}
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
        <div className={`flex items-start gap-2 rounded-card px-4 py-3 text-label ${outcomeMeta[outcome.status].colorClass}`}>
          <span className="mt-1 shrink-0">{outcomeMeta[outcome.status].icon}</span>
          <div>
            <p className="font-semibold">{t(outcomeMeta[outcome.status].titleKey)}</p>
            <p>{t(outcomeMeta[outcome.status].bodyKey, { address: outcome.lnAddress, amount: formatSats(outcome.amountSats) })}</p>
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
