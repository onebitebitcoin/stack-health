import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getApiErrorMessage } from '../../api/errors'
import { fetchHarvestUserStatus } from '../../api/harvestAdmin'

const MONTH_RE = /^\d{4}-\d{2}$/

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`
}

export default function HarvestUserStatusTable({ month }: { month: string }) {
  const { t } = useTranslation('admin')
  const query = useQuery({
    queryKey: ['admin-harvest-users', month],
    queryFn: () => fetchHarvestUserStatus(month),
    enabled: MONTH_RE.test(month),
  })
  const rows = query.data?.rows ?? []
  const poolOranges = query.data?.pool_oranges ?? 0
  const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((acc, row) => acc + pick(row), 0)
  const totalShare = poolOranges > 0 ? (sum((r) => r.total) / poolOranges) * 100 : 0
  const breakdown = (growing: number, ripe: number, collected: number) => [
    [t('harvestColGrowing'), growing],
    [t('harvestColRipe'), ripe],
    [t('harvestColCollected'), collected],
  ] as const

  return (
    <div className="rounded-card bg-theme-surface p-4 space-y-3">
      <p className="text-body font-semibold text-theme-primary">{t('harvestUsersTitle')}</p>
      {query.isLoading && <p className="text-label text-theme-muted">{t('loading')}</p>}
      {query.isError && <p className="text-label text-danger">{getApiErrorMessage(query.error, t('loadFailed'))}</p>}
      {query.isSuccess && rows.length === 0 && <p className="text-label text-theme-muted">{t('harvestUsersEmpty')}</p>}
      {rows.length > 0 && (
        <>
        <div className="hidden md:block">
          <table className="w-full text-label tabular-nums">
            <thead>
              <tr className="text-left text-theme-muted">
                <th scope="col" className="py-2 pr-3 font-normal">{t('harvestColUser')}</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">{t('harvestColGrowing')}</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">{t('harvestColRipe')}</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">{t('harvestColCollected')}</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">{t('harvestColTotal')}</th>
                <th scope="col" className="py-2 text-right font-normal">{t('harvestColShare')}</th>
              </tr>
            </thead>
            <tbody className="text-theme-primary">
              {rows.map((row) => (
                <tr key={row.user_id} className="border-t border-theme-border">
                  <td className="py-2 pr-3">{row.username}</td>
                  <td className="py-2 pr-3 text-right">{formatNumber(row.growing)}</td>
                  <td className="py-2 pr-3 text-right">{formatNumber(row.ripe)}</td>
                  <td className="py-2 pr-3 text-right">{formatNumber(row.collected)}</td>
                  <td className="py-2 pr-3 text-right">{formatNumber(row.total)}</td>
                  <td className="py-2 text-right">{formatPct(row.share_pct)}</td>
                </tr>
              ))}
              <tr className="border-t border-theme-border font-semibold">
                <td className="py-2 pr-3">{t('harvestTotal')}</td>
                <td className="py-2 pr-3 text-right">{formatNumber(sum((r) => r.growing))}</td>
                <td className="py-2 pr-3 text-right">{formatNumber(sum((r) => r.ripe))}</td>
                <td className="py-2 pr-3 text-right">{formatNumber(sum((r) => r.collected))}</td>
                <td className="py-2 pr-3 text-right">{formatNumber(sum((r) => r.total))}</td>
                <td className="py-2 text-right">{formatPct(totalShare)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul data-testid="harvest-user-list" className="md:hidden text-label">
          {[
            ...rows.map((row) => ({ key: String(row.user_id), name: row.username, total: row.total, share: row.share_pct, parts: breakdown(row.growing, row.ripe, row.collected), bold: false })),
            { key: 'total', name: t('harvestTotal'), total: sum((r) => r.total), share: totalShare, parts: breakdown(sum((r) => r.growing), sum((r) => r.ripe), sum((r) => r.collected)), bold: true },
          ].map((item) => (
            <li key={item.key} className="border-t border-theme-border py-2 first:border-t-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`min-w-0 truncate text-theme-primary ${item.bold ? 'font-semibold' : ''}`}>{item.name}</span>
                <span className="whitespace-nowrap font-semibold tabular-nums text-theme-primary">
                  {formatNumber(item.total)}개 · {formatPct(item.share)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 tabular-nums text-theme-muted">
                {item.parts.map(([label, value]) => (
                  <span key={label} className="whitespace-nowrap">{label} {formatNumber(value)}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  )
}
