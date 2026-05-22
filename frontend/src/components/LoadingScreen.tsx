import LogoMark from './LogoMark'

export default function LoadingScreen() {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-theme-page px-6 text-center">
      <div className="rounded-3xl bg-theme-surface p-5 text-accent shadow-[0_0_40px_rgba(181,255,46,0.12)]">
        <LogoMark aria-hidden="true" size={56} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold tracking-widest text-theme-primary uppercase">
          Stack Health
        </p>
        <p className="mt-1 text-xs text-theme-muted">운동 기록이 스코어가 되는 중</p>
      </div>
    </div>
  )
}
