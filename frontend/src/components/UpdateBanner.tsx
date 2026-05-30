import { RefreshCw } from 'lucide-react'

interface Props {
  serverVersion: string | null
}

export default function UpdateBanner({ serverVersion }: Props) {
  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+4rem)] inset-x-0 z-[90] flex justify-center px-4 pointer-events-none">
      <div className="flex items-center gap-3 rounded-2xl bg-accent px-4 py-3 shadow-xl pointer-events-auto">
        <span className="text-sm font-semibold text-accent-fg">
          v{__APP_VERSION__} → v{serverVersion ?? '?'}
        </span>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 rounded-xl bg-accent-fg/20 px-3 py-1.5 text-xs font-bold text-accent-fg active:opacity-70"
        >
          <RefreshCw size={12} />
          업데이트
        </button>
      </div>
    </div>
  )
}
