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
      <rect x="3" y="16" width="6" height="16" rx="2" fill="currentColor" />
      {/* Left bar */}
      <rect x="9" y="21" width="10" height="6" rx="1.5" fill="currentColor" />
      {/* Right bar */}
      <rect x="29" y="21" width="10" height="6" rx="1.5" fill="currentColor" />
      {/* Right weight plate */}
      <rect x="39" y="16" width="6" height="16" rx="2" fill="currentColor" />
      <path
        d="M26 9L18 25h6l-3 14 9-17h-6l2-13z"
        fill="currentColor"
      />
    </svg>
  )
}
