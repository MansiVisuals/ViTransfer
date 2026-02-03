'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import LogoMark from './LogoMark'

type BrandLogoProps = {
  size?: number // legacy square size
  height?: number // preferred height; width auto for custom SVGs
  className?: string
  ariaHidden?: boolean
}

/**
 * Displays custom uploaded SVG logo when configured, otherwise falls back to LogoMark.
 * Fetches brandingLogoPath from /api/settings/theme (cached in localStorage).
 */
export function BrandLogo({ size = 64, height, className, ariaHidden = false }: BrandLogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const resolvedHeight = height || size

  useEffect(() => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('brandingLogoUrl') : null
    if (cached) setLogoUrl(cached)

    const controller = new AbortController()
    fetch('/api/settings/theme', { signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        if (data.brandingLogoPath) {
          const url = '/api/branding/logo'
          setLogoUrl(url)
          localStorage.setItem('brandingLogoUrl', url)
        } else {
          setLogoUrl(null)
          localStorage.removeItem('brandingLogoUrl')
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [])

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt="Company logo"
        height={resolvedHeight}
        style={{ height: `${resolvedHeight}px`, width: 'auto', maxWidth: `${resolvedHeight * 3}px` }}
        className={cn('shrink-0', className)}
        aria-hidden={ariaHidden}
      />
    )
  }

  return <LogoMark size={resolvedHeight} className={className} ariaHidden={ariaHidden} />
}

export default BrandLogo
