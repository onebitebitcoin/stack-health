import { Smartphone, Download, CheckCircle, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

function StepList({ steps }: { steps: string[] }) {
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
      {steps.map((step, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-4 py-3 border-b border-theme-border last:border-b-0"
        >
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 mt-0.5">
            {i === steps.length - 1 ? (
              <CheckCircle size={13} className="text-accent" />
            ) : (
              <span className="text-[11px] font-bold text-accent">{i + 1}</span>
            )}
          </div>
          <p className="text-sm text-theme-primary leading-relaxed">{step}</p>
        </div>
      ))}
    </div>
  )
}

interface FindAddressStep {
  step: string
  desc: string
}

export default function LightningWalletGuidePage() {
  const { t } = useTranslation('auth')

  const androidSteps = t('walletAndroid', { returnObjects: true }) as string[]
  const iosSteps = t('walletIos', { returnObjects: true }) as string[]
  const findAddressSteps = t('findAddressSteps', { returnObjects: true }) as FindAddressStep[]

  return (
    <div className="min-h-screen bg-theme-page px-5 py-6 max-w-lg mx-auto">
<div className="mb-2">
        <p className="font-bold text-theme-primary text-lg">{t('walletGuideTitle')}</p>
        <p className="text-xs text-theme-muted">{t('walletGuideSubtitle')}</p>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wider text-theme-subtle mb-3">{t('installStep')}</p>

      <div className="space-y-4 mb-8">
        {/* Android */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={14} className="text-theme-muted" />
            <span className="text-sm font-medium text-theme-primary">Android</span>
            <a
              href="https://play.google.com/store/apps/details?id=com.livingroomofsatoshi.wallet"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 rounded-lg bg-theme-surface px-3 py-1.5 text-xs font-medium text-accent border border-theme-border hover:bg-theme-surface2"
            >
              <Download size={12} />
              {t('playStore')}
            </a>
          </div>
          <StepList steps={androidSteps} />
        </div>

        {/* iOS */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={14} className="text-theme-muted" />
            <span className="text-sm font-medium text-theme-primary">iPhone (iOS)</span>
            <a
              href="https://apps.apple.com/app/wallet-of-satoshi/id1438599608"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 rounded-lg bg-theme-surface px-3 py-1.5 text-xs font-medium text-accent border border-theme-border hover:bg-theme-surface2"
            >
              <Download size={12} />
              {t('appStore')}
            </a>
          </div>
          <StepList steps={iosSteps} />
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wider text-theme-subtle mb-3">{t('findAddressStep')}</p>

      <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden mb-8">
        {findAddressSteps.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-3 px-4 py-3.5 border-b border-theme-border last:border-b-0"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 mt-0.5">
              {i === findAddressSteps.length - 1 ? (
                <CheckCircle size={14} className="text-accent" />
              ) : (
                <MapPin size={12} className="text-accent" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-theme-primary mb-0.5">{item.step}</p>
              <p className="text-xs text-theme-muted leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 px-4 py-3 mb-6">
        <p className="text-xs font-semibold text-yellow-500 mb-1">{t('lightningAddressFormat')}</p>
        <p className="text-xs text-theme-muted leading-relaxed">
          {t('lightningAddressFormatDesc')}{' '}
          <span className="font-mono text-theme-primary">user@walletofsatoshi.com</span>
        </p>
      </div>

    </div>
  )
}
