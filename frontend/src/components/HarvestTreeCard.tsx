import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import client from '../api/client'
import type { HarvestMonthSummary, MonthlyHarvest } from '../api/types'
import OrangeTree from './OrangeTree'

// 현재 KST 월 (YYYY-MM). 서버의 "month 생략 = 이번 달" 기준과 맞춘다.
function currentKstMonth(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' })
    .format(new Date())
}

function parseMonth(month: string): { year: number; month: number } {
  const [y, m] = month.split('-')
  return { year: Number(y), month: Number(m) }
}

// 'YYYY-MM-DD' -> 'M/D'
function shortDate(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

// 성장 단계는 두지 않는다 — 나무는 항상 다 자란 모습이고, 열매만 그 달 수확한 오렌지로 바뀐다.
export default function HarvestTreeCard() {
  const { t } = useTranslation('profile')
  const currentMonth = currentKstMonth()
  const [selected, setSelected] = useState(currentMonth)
  const [helpOpen, setHelpOpen] = useState(false)

  const monthsQuery = useQuery<HarvestMonthSummary[]>({
    queryKey: ['harvest', 'months'],
    queryFn: async () => {
      const res = await client.get<{ data: HarvestMonthSummary[] }>('/users/me/harvest/months')
      return res.data.data
    },
  })

  const harvestQuery = useQuery<MonthlyHarvest>({
    queryKey: ['harvest', selected],
    queryFn: async () => {
      const res = await client.get<{ data: MonthlyHarvest }>('/users/me/harvest', { params: { month: selected } })
      return res.data.data
    },
  })

  const monthList = monthsQuery.data ?? []
  // 이동 가능한 달: 수확 이력이 있는 달 + 항상 현재 달
  const navMonths = Array.from(new Set([...monthList.map((m) => m.month), currentMonth])).sort()
  const byMonth = new Map(monthList.map((m) => [m.month, m]))
  const maxOranges = Math.max(0, ...monthList.map((m) => m.my_oranges))
  const harvest = harvestQuery.data
  const isCurrent = selected === currentMonth
  const sel = parseMonth(selected)

  const tallyLabel = isCurrent ? t('harvestThisMonth') : t('harvestPastMonth', { month: sel.month })
  // 진행 중 회차의 예상분 — 큰 숫자에 이미 포함돼 있고, 그중 얼마가 예상인지만 따로 알려준다
  const estimated = harvest ? harvest.rounds.filter((r) => r.is_estimate).reduce((sum, r) => sum + r.oranges, 0) : 0

  return (
    <div className="mx-4 mb-4 rounded-card bg-theme-surface px-4 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <h2 className="text-title font-semibold text-theme-primary">{t('harvestTitle')}</h2>
          <button
            type="button"
            aria-label={t('harvestHelpAria')}
            aria-expanded={helpOpen}
            aria-controls="harvest-help"
            onClick={() => setHelpOpen((v) => !v)}
            className="p-1 text-theme-muted"
          >
            <Info size={16} />
          </button>
        </div>
      </div>

      {helpOpen && (
        <div id="harvest-help" className="mt-3 rounded-card bg-theme-surface-2 px-3 py-2 text-label text-theme-muted">
          <p>{t('harvestHelpScore')}</p>
          <p>{t('harvestHelpSplit')}</p>
          {harvest && <p>{t('harvestFruitUnit', { count: harvest.oranges_per_fruit })}</p>}
          <p>{t('harvestEstimateNote')}</p>
        </div>
      )}

      {harvestQuery.isLoading && (
        <div
          className="mt-4 h-36 rounded-card animate-shimmer"
          style={{
            background: 'linear-gradient(90deg, var(--bg-surface-2) 25%, var(--bg-surface) 50%, var(--bg-surface-2) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
      )}

      {(harvestQuery.isError || monthsQuery.isError) && (
        <p role="alert" className="mt-4 text-body text-theme-muted">{t('harvestLoadFailed')}</p>
      )}

      {harvest && (
        <>
          <div className="mt-4 flex items-center gap-4">
            <OrangeTree stage="tree" fruitCount={harvest.fruit_count} fruitSize="medium" size={112} />
            <div className="min-w-0">
              <p className="text-label text-theme-muted">{tallyLabel}</p>
              <p data-testid="harvest-total" className="font-display text-3xl font-bold tabular-nums text-accent-text">
                {t('harvestCount', { count: harvest.my_oranges })}
              </p>
              {harvest.has_estimate && (
                <p className="mt-1 text-label tabular-nums text-accent-text">
                  {t('harvestEstimateIncluded', { count: estimated })}
                </p>
              )}
            </div>
          </div>


          {harvest.rounds.length === 0 ? (
            <p className="mt-4 text-center text-body text-theme-muted">{t('harvestEmpty')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-theme-border">
              {harvest.rounds.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-body">
                  <span className="tabular-nums text-theme-primary">
                    {shortDate(r.start_date)}~{shortDate(r.end_date)}
                  </span>
                  <span
                    className={`rounded-pill px-2 py-0.5 text-label ${
                      r.status === 'paid' ? 'bg-leaf/15 text-leaf' : 'bg-accent/15 text-accent-text'
                    }`}
                  >
                    {t(r.status === 'paid' ? 'harvestRoundPaid' : 'harvestRoundOpen')}
                  </span>
                  <span className="tabular-nums text-theme-primary">
                    {r.is_estimate && `${t('harvestEstimatePrefix')} `}
                    {t('harvestCount', { count: r.oranges })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {navMonths.length >= 2 && (
        <div role="group" aria-label={t('harvestMonthsAria')} className="mt-4 flex items-end justify-between gap-1">
          {navMonths.map((month) => {
            const m = byMonth.get(month) ?? { month, my_oranges: 0, pool_oranges: 0, share_pct: 0, round_count: 0 }
            const active = m.month === selected
            const pct = maxOranges > 0 ? Math.max(4, (m.my_oranges / maxOranges) * 100) : 4
            return (
              <button
                key={m.month}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(m.month)}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
              >
                <span className="flex h-12 w-full items-end justify-center">
                  <span
                    className={`w-3 rounded-pill ${active ? 'bg-leaf' : 'bg-leaf/30'}`}
                    style={{ height: `${pct}%` }}
                  />
                </span>
                <span className={`text-label ${active ? 'text-theme-primary font-medium' : 'text-theme-muted'}`}>
                  {t('harvestStripMonth', { month: parseMonth(m.month).month })}
                </span>
                <span className="text-label tabular-nums text-theme-muted">{m.my_oranges}</span>
                <span className="text-label tabular-nums text-theme-muted">{t('harvestRoundCount', { count: m.round_count })}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
