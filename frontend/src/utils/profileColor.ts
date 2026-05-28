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
