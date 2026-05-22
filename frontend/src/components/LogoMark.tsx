import type { SVGProps } from 'react'

interface LogoMarkProps extends SVGProps<SVGSVGElement> {
  size?: number
}

export default function LogoMark({ size = 48, className = '', ...props }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Left weight plate */}
      <rect x="2" y="16" width="6" height="16" rx="2" fill="currentColor" />
      {/* Left bar */}
      <rect x="8" y="21" width="9" height="6" rx="1.5" fill="currentColor" />
      {/* Right bar */}
      <rect x="31" y="21" width="9" height="6" rx="1.5" fill="currentColor" />
      {/* Right weight plate */}
      <rect x="40" y="16" width="6" height="16" rx="2" fill="currentColor" />
      {/* Lightning bolt (bitcoin energy) */}
      <path
        d="M27 10L19 25h6l-3 13 10-16h-6l3-12z"
        fill="currentColor"
      />
    </svg>
  )
}
