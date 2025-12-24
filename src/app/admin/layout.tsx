'use client'

import { AuthProvider } from '@/components/AuthProvider'
import AdminHeader from '@/components/AdminHeader'
import SessionMonitor from '@/components/SessionMonitor'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

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

  const hideFooter = pathname?.startsWith('/admin/projects/') && pathname?.endsWith('/share')

  return (
    <AuthProvider requireAuth={true}>
      <div className="flex flex-1 min-h-0 bg-background flex-col overflow-x-hidden">
        <AdminHeader />
        <div className={hideFooter ? 'flex-1' : 'flex-1 lg:pb-16'}>{children}</div>
        {!hideFooter && (
          <footer className="border-t bg-card mt-4 px-4 py-3 lg:fixed lg:bottom-0 lg:left-0 lg:right-0 lg:z-10 lg:mt-0">
            <div className="max-w-screen-2xl mx-auto text-center text-xs text-muted-foreground space-y-1">
              <div>
                Powered by{' '}
                <a
                  href="https://github.com/MansiVisuals/ViTransfer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  ViTransfer
                </a>
              </div>
              {process.env.NEXT_PUBLIC_APP_VERSION && (
                <div className="text-[10px] uppercase tracking-wide">
                  Version: {process.env.NEXT_PUBLIC_APP_VERSION}
                </div>
              )}
            </div>
          </footer>
        )}
        <SessionMonitor />
      </div>
    </AuthProvider>
  )
}
