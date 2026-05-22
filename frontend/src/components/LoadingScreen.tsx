import LogoMark from './LogoMark'

export default function LoadingScreen() {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-theme-page">
      <div className="animate-pulse text-accent">
        <LogoMark size={56} />
      </div>
      <p className="text-sm font-semibold tracking-widest text-theme-muted uppercase">
        Stack Health
      </p>
    </div>
  )
}
