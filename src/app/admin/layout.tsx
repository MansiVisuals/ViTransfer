'use client'

import { AuthProvider } from '@/components/AuthProvider'
import AdminHeader from '@/components/AdminHeader'
import SessionMonitor from '@/components/SessionMonitor'
import { useEffect, useRef } from 'react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headerRef = useRef<HTMLDivElement>(null)

  // Prevent caching of admin pages
  useEffect(() => {
    // Set cache control headers via meta tags as fallback
    const metaCache = document.querySelector('meta[http-equiv="Cache-Control"]')
    if (!metaCache) {
      const meta = document.createElement('meta')
      meta.httpEquiv = 'Cache-Control'
      meta.content = 'no-store, no-cache, must-revalidate, private'
      document.head.appendChild(meta)
      
      const metaPragma = document.createElement('meta')
      metaPragma.httpEquiv = 'Pragma'
      metaPragma.content = 'no-cache'
      document.head.appendChild(metaPragma)
      
      const metaExpires = document.createElement('meta')
      metaExpires.httpEquiv = 'Expires'
      metaExpires.content = '0'
      document.head.appendChild(metaExpires)
    }
  }, [])

  // Allow components (e.g. share sidebar) to size to viewport minus header.
  useEffect(() => {
    const headerEl = headerRef.current
    if (!headerEl) return

    const update = () => {
      document.documentElement.style.setProperty('--admin-header-height', `${headerEl.offsetHeight}px`)
    }

    update()

    const observer = new ResizeObserver(() => update())
    observer.observe(headerEl)

    return () => {
      observer.disconnect()
      document.documentElement.style.setProperty('--admin-header-height', '0px')
    }
  }, [])

  return (
    <AuthProvider requireAuth={true}>
      <div className="flex flex-1 min-h-0 bg-background flex-col overflow-x-hidden">
        <div ref={headerRef}>
          <AdminHeader />
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          {children}
        </div>
        <SessionMonitor />
      </div>
    </AuthProvider>
  )
}
