import { Zap } from 'lucide-react'

interface PointBadgeProps {
  points: number
}

export default function PointBadge({ points }: PointBadgeProps) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs font-semibold text-accent backdrop-blur">
      <Zap size={12} fill="currentColor" />
      <span>{points}L</span>
    </div>
  )
}
