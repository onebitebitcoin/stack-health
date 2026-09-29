import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Sprout, XCircle } from 'lucide-react'
import { getApiErrorMessage } from '../../api/errors'
import {
  createRound,
  deleteRound,
  fetchRoundDetail,
  fetchRounds,
  generateRounds,
  payRound,
  type HarvestCadence,
  type HarvestOpenRow,
  type HarvestPaidRow,
  type HarvestRound,
} from '../../api/harvestAdmin'

type ConfirmKind = 'pay' | 'delete'
// scope: 상세 패널의 확인 영역 옆에 보여줄지(detail), 화면 상단에 보여줄지(top)
type Notice = { kind: 'success' | 'error'; message: string; scope: 'top' | 'detail' }
const MONTH_RE = /^\d{4}-\d{2}$/

const CADENCES: HarvestCadence[] = ['weekly', 'biweekly', 'monthly']

// 현재 한국 시간(Asia/Seoul) 기준 YYYY-MM
function currentKstMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  return `${year}-${month}`
}

// 현재 한국 시간(Asia/Seoul) 기준 YYYY-MM-DD
function todayKst(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// 'YYYY-MM-DD' 의 다음 날 'YYYY-MM-DD'
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// 'YYYY-MM-DD' -> 'M/D'
function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

function formatRange(round: HarvestRound): string {
  return `${formatShortDate(round.start_date)}~${formatShortDate(round.end_date)}`
}

// 지급 시각은 한국 시간 기준 M/D 로 표시
function formatPaidDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).format(new Date(iso))
}

function formatNumber(value: number, maxFractionDigits = 1): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits })
}

function isPaidRow(row: HarvestOpenRow | HarvestPaidRow): row is HarvestPaidRow {
  return 'oranges' in row
}

const inputClass = 'w-full rounded-card border border-theme-border bg-theme-surface2 px-4 py-3 text-body text-theme-primary outline-none focus:border-accent disabled:opacity-50'
const labelClass = 'block text-label text-theme-muted mb-1'

export default function AdminHarvestTab() {
  const { t } = useTranslation('admin')
  const qc = useQueryClient()

  const [month, setMonth] = useState(currentKstMonth)
  const [cadence, setCadence] = useState<HarvestCadence>('weekly')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const roundsQuery = useQuery({
    queryKey: ['admin-harvest-rounds', month],
    queryFn: () => fetchRounds(month),
    enabled: MONTH_RE.test(month),
  })

  const detailQuery = useQuery({
    queryKey: ['admin-harvest-detail', selectedId],
    queryFn: () => fetchRoundDetail(selectedId as number),
    enabled: selectedId !== null,
  })

  function refresh() {
    qc.invalidateQueries({ queryKey: ['admin-harvest-rounds'] })
    qc.invalidateQueries({ queryKey: ['admin-harvest-detail'] })
  }

  function onSuccess(message: string, scope: Notice['scope'] = 'detail') {
    setNotice({ kind: 'success', message, scope })
    setConfirm(null)
    refresh()
  }

  function onError(err: unknown) {
    setNotice({ kind: 'error', message: getApiErrorMessage(err, t('harvestErrorFallback')), scope: selectedId !== null ? 'detail' : 'top' })
    setConfirm(null)
  }

  const generate = useMutation({
    mutationFn: () => {
      const [year, mon] = month.split('-').map(Number)
      return generateRounds({ year, month: mon, cadence })
    },
    onSuccess: (rounds) => onSuccess(t('harvestGenerateSuccess', { count: rounds.length }), 'top'),
    onError,
  })

  const create = useMutation({
    mutationFn: () => createRound({ start_date: startDate, end_date: endDate }),
    onSuccess: () => {
      setStartDate('')
      setEndDate('')
      onSuccess(t('harvestCreateSuccess'), 'top')
    },
    onError,
  })

  const pay = useMutation({
    mutationFn: (id: number) => payRound(id),
    onSuccess: () => onSuccess(t('harvestPaySuccess')),
    onError,
  })

  const remove = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => deleteRound(id, force),
    onSuccess: () => {
      setSelectedId(null)
      onSuccess(t('harvestDeleteSuccess'), 'top')
    },
    onError,
  })

  const busy = generate.isPending || create.isPending || pay.isPending || remove.isPending
  const detail = detailQuery.data
  const rounds = roundsQuery.data ?? []

  function handleMonthChange(value: string) {
    setMonth(value)
    setSelectedId(null)
    setConfirm(null)
    setNotice(null)
  }

  function handleSelect(id: number) {
    setSelectedId(id)
    setConfirm(null)
    setNotice(null)
  }

  function handleConfirm() {
    if (selectedId === null || busy) return
    if (confirm === 'pay') pay.mutate(selectedId)
    else if (confirm === 'delete') remove.mutate({ id: selectedId, force: detail?.round.status === 'paid' })
  }

  const canGenerate = MONTH_RE.test(month)
  // 기간이 끝난 다음 날(KST)부터 지급 완료 처리할 수 있다
  const payableFrom = detail ? nextDay(detail.round.end_date) : ''
  const payBlocked = detail?.round.status === 'open' && todayKst() < payableFrom

  function renderNotice(scope: Notice['scope']) {
    if (!notice || notice.scope !== scope) return null
    return (
      <div
        role={notice.kind === 'error' ? 'alert' : 'status'}
        className={`flex items-start gap-2 rounded-card px-3 py-2 text-label ${notice.kind === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
      >
        {notice.kind === 'success' ? <CheckCircle2 size={14} className="mt-1 shrink-0" /> : <XCircle size={14} className="mt-1 shrink-0" />}
        <span>{notice.message}</span>
      </div>
    )
  }

  const totalOranges = detail
    ? detail.rows.reduce((sum, row) => sum + (isPaidRow(row) ? row.oranges : row.expected_oranges), 0)
    : 0

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-theme-surface p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Sprout size={15} className="text-accent" />
          <p className="text-body font-semibold text-theme-primary">{t('tabHarvest')}</p>
        </div>

        <div>
          <label htmlFor="harvest-month" className={labelClass}>{t('harvestMonthLabel')}</label>
          <input
            id="harvest-month"
            type="month"
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
            className={inputClass}
          />
        </div>

        {renderNotice('top')}

        {roundsQuery.isLoading && <p className="text-label text-theme-muted">{t('loading')}</p>}
        {roundsQuery.isError && <p className="text-label text-danger">{getApiErrorMessage(roundsQuery.error, t('loadFailed'))}</p>}
        {roundsQuery.isSuccess && rounds.length === 0 && <p className="text-label text-theme-muted">{t('harvestEmpty')}</p>}

        {rounds.length > 0 && (
          <ul className="space-y-2">
            {rounds.map((round) => (
              <li key={round.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(round.id)}
                  aria-pressed={selectedId === round.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-card border px-4 py-3 text-left ${selectedId === round.id ? 'border-accent bg-theme-surface2' : 'border-theme-border bg-theme-surface2'}`}
                >
                  <span className="text-body font-semibold tabular-nums text-theme-primary">{formatRange(round)}</span>
                  <span className="flex items-center gap-2 text-label text-theme-muted">
                    <span className={round.status === 'paid' ? 'text-success' : 'text-warning'}>
                      {round.status === 'paid' && round.paid_at
                        ? t('harvestStatusPaidOn', { date: formatPaidDate(round.paid_at) })
                        : round.status === 'paid'
                          ? t('harvestStatusPaid')
                          : t('harvestStatusOpen')}
                    </span>
                    <span className="tabular-nums">{t('harvestParticipants', { count: round.participant_count })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-card bg-theme-surface p-4 space-y-3">
        <div>
          <label htmlFor="harvest-cadence" className={labelClass}>{t('harvestCadenceLabel')}</label>
          <select
            id="harvest-cadence"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as HarvestCadence)}
            disabled={busy}
            className={inputClass}
          >
            {CADENCES.map((c) => <option key={c} value={c}>{t(`harvestCadence_${c}`)}</option>)}
          </select>
        </div>
        <p className="text-label text-theme-muted">{t('harvestGenerateHelp')}</p>
        <button
          type="button"
          onClick={() => { setNotice(null); generate.mutate() }}
          disabled={busy || !canGenerate}
          className="w-full rounded-card bg-accent py-3 text-body font-semibold text-accent-fg disabled:opacity-50"
        >
          {generate.isPending ? t('harvestGenerating') : t('harvestGenerateButton')}
        </button>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setNotice(null); create.mutate() }}
        className="rounded-card bg-theme-surface p-4 space-y-3"
      >
        <p className="text-body font-semibold text-theme-primary">{t('harvestManualTitle')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="harvest-start-date" className={labelClass}>{t('harvestStartDateLabel')}</label>
            <input id="harvest-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={busy} className={inputClass} />
          </div>
          <div>
            <label htmlFor="harvest-end-date" className={labelClass}>{t('harvestEndDateLabel')}</label>
            <input id="harvest-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={busy} className={inputClass} />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy || !startDate || !endDate}
          className="w-full rounded-card bg-theme-surface2 py-3 text-body font-semibold text-theme-primary disabled:opacity-50"
        >
          {create.isPending ? t('harvestCreating') : t('harvestCreateButton')}
        </button>
      </form>

      {selectedId !== null && (
        <div className="rounded-card bg-theme-surface p-4 space-y-3">
          {detailQuery.isLoading && <p className="text-label text-theme-muted">{t('loading')}</p>}
          {detailQuery.isError && <p className="text-label text-danger">{getApiErrorMessage(detailQuery.error, t('loadFailed'))}</p>}

          {detail && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-body font-semibold tabular-nums text-theme-primary">{formatRange(detail.round)}</p>
                <p className="text-label text-theme-muted">{detail.is_estimate ? t('harvestEstimateNote') : t('harvestFinalNote')}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-label tabular-nums">
                  <thead>
                    <tr className="text-left text-theme-muted">
                      <th scope="col" className="py-2 pr-3 font-normal">{t('harvestColUser')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-normal">{t('harvestColUploads')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-normal">{t('harvestColComments')}</th>
                      <th scope="col" className="py-2 pr-3 text-right font-normal">{t('harvestColScore')}</th>
                      {detail.is_estimate && <th scope="col" className="py-2 pr-3 text-right font-normal">{t('harvestColProbability')}</th>}
                      <th scope="col" className="py-2 text-right font-normal">{detail.is_estimate ? t('harvestColExpected') : t('harvestColOranges')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-theme-primary">
                    {detail.rows.map((row) => (
                      <tr key={row.user_id} className="border-t border-theme-border">
                        <td className="py-2 pr-3">{row.username}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(row.uploads, 0)}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(row.comments, 0)}</td>
                        <td className="py-2 pr-3 text-right">{formatNumber(row.score, 2)}</td>
                        {!isPaidRow(row) && <td className="py-2 pr-3 text-right">{`${formatNumber(row.probability_pct, 2)}%`}</td>}
                        <td className="py-2 text-right">{formatNumber(isPaidRow(row) ? row.oranges : row.expected_oranges)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-theme-border font-semibold">
                      <td className="py-2 pr-3" colSpan={detail.is_estimate ? 5 : 4}>{t('harvestTotal')}</td>
                      <td className="py-2 text-right">{formatNumber(totalOranges)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {confirm ? (
                <div className="rounded-card border border-theme-border bg-theme-surface2 p-4 space-y-3">
                  {confirm === 'delete' && detail.round.status === 'paid' && (
                    <p role="alert" className="flex items-start gap-2 text-body font-semibold text-danger">
                      <AlertTriangle size={16} className="mt-1 shrink-0" />
                      <span>{t('harvestDeletePaidWarning')}</span>
                    </p>
                  )}
                  <p className="text-body text-theme-primary">
                    {confirm === 'pay' ? t('harvestPayConfirmBody') : t('harvestDeleteConfirmBody')}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirm(null)}
                      disabled={busy}
                      className="flex-1 rounded-card bg-theme-surface py-3 text-body text-theme-muted disabled:opacity-60"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={busy}
                      className="flex-1 rounded-card bg-accent py-3 text-body font-semibold text-accent-fg disabled:opacity-60"
                    >
                      {t('harvestConfirmButton')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  {detail.round.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => { setNotice(null); setConfirm('pay') }}
                      disabled={busy || payBlocked}
                      className="flex-1 rounded-card bg-accent py-3 text-body font-semibold text-accent-fg disabled:opacity-50"
                    >
                      {t('harvestPayButton')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setNotice(null); setConfirm('delete') }}
                    disabled={busy}
                    className="flex-1 rounded-card bg-danger/10 py-3 text-body font-semibold text-danger disabled:opacity-50"
                  >
                    {t('harvestDeleteButton')}
                  </button>
                </div>
              )}
              {payBlocked && !confirm && (
                <p className="text-label text-theme-muted">{t('harvestPayBlockedHint', { date: formatShortDate(payableFrom) })}</p>
              )}
              {renderNotice('detail')}
            </>
          )}
        </div>
      )}
    </div>
  )
}
