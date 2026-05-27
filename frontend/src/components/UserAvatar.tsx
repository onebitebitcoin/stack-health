const PROFILE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#14b8a6', '#22c55e', '#3b82f6', '#eab308',
]

export function getProfileColor(username: string, storedColor?: string | null): string {
  if (storedColor) return storedColor
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length]
}

interface UserAvatarProps {
  username: string
  avatarUrl?: string | null
  profileColor?: string | null
  size?: number
  className?: string
}

export default function UserAvatar({ username, avatarUrl, profileColor, size = 36, className = '' }: UserAvatarProps) {
  const color = getProfileColor(username, profileColor)
  const initial = username[0]?.toUpperCase() ?? '?'

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }

  return (
    <div
      style={{ width: size, height: size, backgroundColor: color }}
      className={`rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white ${className}`}
    >
      <span style={{ fontSize: Math.max(10, size * 0.4) }}>{initial}</span>
    </div>
  )
}
