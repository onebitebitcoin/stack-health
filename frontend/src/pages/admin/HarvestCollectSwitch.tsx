import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle } from 'lucide-react'
import { getApiErrorMessage } from '../../api/errors'
import { fetchHarvestSettings, updateHarvestSettings } from '../../api/harvestAdmin'

type Notice = { kind: 'success' | 'error'; message: string }

export default function HarvestCollectSwitch() {
  const { t } = useTranslation('admin')
  const qc = useQueryClient()
  const [notice, setNotice] = useState<Notice | null>(null)

  const settingsQuery = useQuery({ queryKey: ['admin-harvest-settings'], queryFn: fetchHarvestSettings })

  const update = useMutation({
    mutationFn: (enabled: boolean) => updateHarvestSettings(enabled),
    onSuccess: (settings) => {
      qc.setQueryData(['admin-harvest-settings'], settings)
      qc.invalidateQueries({ queryKey: ['admin-harvest-users'] })
      setNotice({ kind: 'success', message: t(settings.collect_enabled ? 'harvestSwitchOnSuccess' : 'harvestSwitchOffSuccess') })
    },
    onError: (err) => setNotice({ kind: 'error', message: getApiErrorMessage(err, t('harvestErrorFallback')) }),
  })

  const enabled = settingsQuery.data?.collect_enabled ?? false

  function handleToggle() {
    const next = !enabled
    if (!window.confirm(t(next ? 'harvestSwitchConfirmOn' : 'harvestSwitchConfirmOff'))) return
    setNotice(null)
    update.mutate(next)
  }

  return (
    <div className="rounded-card bg-theme-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p id="harvest-switch-label" className="text-body font-semibold text-theme-primary">{t('harvestSwitchLabel')}</p>
          {settingsQuery.isSuccess && (
            <p className="text-label text-theme-muted">{t(enabled ? 'harvestSwitchOn' : 'harvestSwitchOff')}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="harvest-switch-label"
          onClick={handleToggle}
          disabled={!settingsQuery.isSuccess || update.isPending}
          className={`relative h-6 w-11 shrink-0 rounded-pill transition-colors disabled:opacity-50 ${enabled ? 'bg-accent' : 'bg-theme-surface2 border border-theme-border'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-pill bg-white shadow-pop transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      {settingsQuery.isLoading && <p className="text-label text-theme-muted">{t('loading')}</p>}
      {settingsQuery.isError && <p className="text-label text-danger">{getApiErrorMessage(settingsQuery.error, t('loadFailed'))}</p>}
      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-card px-3 py-2 text-label ${notice.kind === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
        >
          {notice.kind === 'success' ? <CheckCircle2 size={14} className="mt-1 shrink-0" /> : <XCircle size={14} className="mt-1 shrink-0" />}
          <span>{notice.message}</span>
        </div>
      )}
    </div>
  )
}
