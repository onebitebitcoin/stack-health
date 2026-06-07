import LogoMark from './LogoMark'

export default function LoadingScreen() {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-theme-page px-6 text-center">
      <div className="text-accent">
        <LogoMark aria-hidden="true" size={56} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold tracking-widest text-theme-primary uppercase">
          Stack Health
        </p>
        <p className="mt-1 text-xs text-theme-muted">건강이 쌓여가는 중</p>
      </div>
    </div>
  )
}
