import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import type { MyHarvest } from '../api/types'
import OrangeTree from './OrangeTree'

// 큰 숫자는 지금까지 모은 오렌지(줄지 않는다), 나무 열매는 이번 주 자라는 오렌지 — 영상을 올리면 바로 열매가 는다.
// 달별 비교는 두지 않는다: 주가 4번인 달과 5번인 달이 섞여 같은 활동도 막대 높이가 달라진다.
export default function HarvestTreeCard() {
  const { t } = useTranslation('profile')
  const [helpOpen, setHelpOpen] = useState(false)
  const queryClient = useQueryClient()

  const harvestQuery = useQuery<MyHarvest>({
    queryKey: ['harvest'],
    queryFn: async () => {
      const res = await client.get<{ data: MyHarvest }>('/users/me/harvest')
      return res.data.data
    },
  })

  const collectMutation = useMutation({
    mutationFn: async () => {
      const res = await client.post<{ data: { collected: number } }>('/users/me/harvest/collect')
      return res.data.data
    },
    onSuccess: (data) => {
      toast.success(t('harvestCollectSuccess', { count: data.collected }))
      queryClient.invalidateQueries({ queryKey: ['harvest'] })
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, t('harvestCollectFailed')))
    },
  })

  const harvest = harvestQuery.data

  return (
    <div className="mx-4 mb-4 rounded-card bg-theme-surface px-4 py-5">
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

      {helpOpen && (
        <div id="harvest-help" className="mt-3 rounded-card bg-theme-surface-2 px-3 py-2 text-label text-theme-muted">
          <p>{t('harvestHelpGrow')}</p>
          <p>{t('harvestEstimateNote')}</p>
          <p>{t('harvestHelpWeekEnd')}</p>
          <p>{t('harvestHelpShare')}</p>
          {harvest && <p>{t('harvestFruitUnit', { count: harvest.oranges_per_fruit })}</p>}
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

      {harvestQuery.isError && (
        <p role="alert" className="mt-4 text-body text-theme-muted">{t('harvestLoadFailed')}</p>
      )}

      {harvest && (
        <>
          <div className="mt-4 flex items-center gap-4">
            <div className="shrink-0">
              <OrangeTree stage="tree" fruitCount={harvest.this_week.fruit_count} fruitSize="medium" size={112} />
            </div>
            <div className="min-w-0">
              <p className="text-label text-theme-muted">{t('harvestTotal')}</p>
              <p data-testid="harvest-total" className="font-display text-display font-bold tabular-nums text-accent-text">
                {t('harvestCount', { count: harvest.total_collected })}
              </p>
              {harvest.this_week.oranges > 0 ? (
                <>
                  <p data-testid="harvest-this-week" className="mt-1 text-body tabular-nums text-theme-primary">
                    {t('harvestGrowing', { count: harvest.this_week.oranges })}
                  </p>
                  <p data-testid="harvest-share" className="text-label text-theme-muted tabular-nums whitespace-nowrap">
                    {t('harvestShare', { pct: harvest.this_week.share_pct })}
                  </p>
                </>
              ) : (
                <p data-testid="harvest-this-week-empty" className="mt-1 text-body text-theme-muted">
                  {t('harvestThisWeekEmpty')}
                </p>
              )}
            </div>
          </div>

          {harvest.collect_enabled && harvest.ripe_oranges > 0 && (
            <button
              type="button"
              disabled={collectMutation.isPending}
              onClick={() => collectMutation.mutate()}
              className="mt-4 w-full rounded-pill bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-50"
            >
              {t('harvestCollect', { count: harvest.ripe_oranges })}
            </button>
          )}
        </>
      )}
    </div>
  )
}
