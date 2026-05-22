interface TagChipProps {
  label: string
}

export default function TagChip({ label }: TagChipProps) {
  return (
    <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
      #{label}
    </span>
  )
}
