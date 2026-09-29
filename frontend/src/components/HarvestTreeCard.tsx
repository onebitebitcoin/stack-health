import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import client from '../api/client'
import type { TreeStatus, TreeStage, HarvestMonthSummary, MonthlyHarvest } from '../api/types'
import OrangeTree from './OrangeTree'

interface HarvestTreeCardProps {
  tree: TreeStatus
}

const STAGE_LABEL_KEY: Record<TreeStage, string> = {
  seed: 'treeStageSeed',
  sprout: 'treeStageSprout',
  sapling: 'treeStageSapling',
  tree: 'treeStageTree',
  grand: 'treeStageGrand',
}

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

export default function HarvestTreeCard({ tree }: HarvestTreeCardProps) {
  const { t } = useTranslation('profile')
  const currentMonth = currentKstMonth()
  const [selected, setSelected] = useState(currentMonth)

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
  const idx = navMonths.indexOf(selected)
  const maxOranges = Math.max(0, ...monthList.map((m) => m.my_oranges))
  const harvest = harvestQuery.data
  const isCurrent = selected === currentMonth
  const sel = parseMonth(selected)

  const tallyLabel = isCurrent
    ? `${t('harvestThisMonth')}${harvest?.has_estimate ? ` ${t('harvestEstimateSuffix')}` : ''}`
    : t('harvestPastMonth', { month: sel.month })

  return (
    <div className="mx-4 mb-4 rounded-card bg-theme-surface px-4 py-5">
      <div className="flex items-center justify-between">
        <h2 className="text-title font-semibold text-theme-primary">{t('harvestTitle')}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('harvestPrevMonth')}
            disabled={idx <= 0}
            onClick={() => setSelected(navMonths[idx - 1])}
            className="p-1 text-theme-muted disabled:opacity-30"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[84px] text-center text-body tabular-nums text-theme-primary">
            {t('harvestMonthLabel', { year: sel.year, month: sel.month })}
          </span>
          <button
            type="button"
            aria-label={t('harvestNextMonth')}
            disabled={idx < 0 || idx >= navMonths.length - 1}
            onClick={() => setSelected(navMonths[idx + 1])}
            className="p-1 text-theme-muted disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {harvestQuery.isLoading && (
        <div
          className="mt-4 h-36 rounded-card animate-shimmer"
          style={{
            background: 'linear-gradient(90deg, var(--bg-surface-2) 25%, var(--bg-surface) 50%, var(--bg-surface-2) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
      )}

      {harvestQuery.isError && (
        <p role="alert" className="mt-4 text-body text-theme-muted">{t('harvestLoadFailed')}</p>
      )}

      {harvest && (
        <>
          <div className="mt-4 flex items-center gap-4">
            <OrangeTree stage={tree.stage} fruitCount={harvest.fruit_count} fruitSize="medium" size={112} />
            <div className="min-w-0">
              <p className="text-label text-theme-muted">{tallyLabel}</p>
              <p data-testid="harvest-total" className="font-display text-3xl font-bold tabular-nums text-accent-text">
                {t('harvestCount', { count: harvest.my_oranges })}
              </p>
              <span className="mt-1 inline-block rounded-pill bg-leaf/15 px-2 py-0.5 text-label tabular-nums text-leaf">
                {t('harvestShare', { pct: harvest.share_pct })}
              </span>
            </div>
          </div>

          <p className="mt-3 text-center text-body text-theme-primary">{t(STAGE_LABEL_KEY[tree.stage])}</p>
          <p className="text-center text-body text-theme-muted">{t('treeDaysGrowing', { count: tree.total_days })}</p>

          <div className="mx-auto mt-3 w-full max-w-[220px]">
            {tree.next_stage_at !== null ? (
              <>
                <div className="flex items-center justify-between text-label text-theme-muted mb-1">
                  <span>{t('treeNextStageLabel')}</span>
                  <span>{t('treeProgressDays', { current: tree.total_days, target: tree.next_stage_at })}</span>
                </div>
                <div className="h-1.5 w-full rounded-pill bg-leaf/25">
                  <div
                    className="h-1.5 rounded-pill bg-leaf transition-all"
                    style={{ width: `${Math.min(100, (tree.total_days / tree.next_stage_at) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-center text-label font-medium text-leaf">{t('treeMaxStageReached')}</p>
            )}
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

      {monthList.length >= 2 && (
        <div role="group" aria-label={t('harvestMonthsAria')} className="mt-4 flex items-end justify-between gap-1">
          {monthList.map((m) => {
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
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
