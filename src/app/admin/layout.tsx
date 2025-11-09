'use client'

import { AuthProvider } from '@/components/AuthProvider'
import AdminHeader from '@/components/AdminHeader'
import SessionMonitor from '@/components/SessionMonitor'
import { useEffect } from 'react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
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

  return (
    <AuthProvider requireAuth={true}>
      <div className="min-h-screen bg-background flex flex-col">
        <AdminHeader />
        <div className="flex-1">{children}</div>
        <footer className="border-t bg-muted/50 py-4 px-6 mt-8">
          <div className="max-w-7xl mx-auto text-center text-xs text-muted-foreground">
            ViTransfer{process.env.NEXT_PUBLIC_APP_VERSION && ` v${process.env.NEXT_PUBLIC_APP_VERSION}`}
          </div>
        </footer>
        <SessionMonitor />
      </div>
    </AuthProvider>
  )
}
