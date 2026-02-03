'use client'

import { cn } from '@/lib/utils'

type LogoMarkProps = {
  size?: number
  accent?: string
  className?: string
  ariaHidden?: boolean
}

/**
 * Reusable ViTransfer logomark. Accent fill uses the global accent color by default.
 */
export function LogoMark({
  size = 64,
  accent = 'hsl(var(--primary, 211 100% 50%))',
  className,
  ariaHidden = false,
}: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={ariaHidden ? 'presentation' : 'img'}
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : 'ViTransfer logo'}
      className={cn('shrink-0', className)}
    >
      <rect width="64" height="64" rx="14" fill="var(--logo-bg)" />
      <rect x="7" y="16" width="38" height="32" rx="9" fill={accent} />
      <rect x="39" y="24" width="12" height="16" rx="5" fill="var(--logo-panel)" />
      <path
        d="M57 24C55.5 22.2 52.5 22.2 51 24L46.5 30C44.5 31.8 44.5 32.2 46.5 34L51 40C52.5 41.8 55.5 41.8 57 40C54.5 34 54.5 30 57 24Z"
        fill="var(--logo-wedge)"
      />
    </svg>
  )
}

export default LogoMark
