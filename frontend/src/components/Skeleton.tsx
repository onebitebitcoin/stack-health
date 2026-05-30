export function SkeletonLine({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-full bg-theme-surface2 ${className}`}
      style={{
        background: 'linear-gradient(90deg, var(--bg-surface-2) 25%, var(--bg-surface) 50%, var(--bg-surface-2) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  )
}

export function SkeletonAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(90deg, var(--bg-surface-2) 25%, var(--bg-surface) 50%, var(--bg-surface-2) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  )
}

export function SkeletonLeaderboardItem() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <SkeletonLine className="w-6 h-4" />
      <SkeletonAvatar size={32} />
      <SkeletonLine className="flex-1 h-4" />
      <SkeletonLine className="w-14 h-4" />
    </div>
  )
}

export function SkeletonCalendarGrid() {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 35 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-xl"
          style={{
            background: 'linear-gradient(90deg, var(--bg-surface-2) 25%, var(--bg-surface) 50%, var(--bg-surface-2) 75%)',
            backgroundSize: '200% 100%',
            animation: `shimmer 1.5s ease-in-out infinite`,
            animationDelay: `${(i % 7) * 0.05}s`,
          }}
        />
      ))}
    </div>
  )
}
