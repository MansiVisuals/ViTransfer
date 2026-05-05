'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import BrandLogo from '@/components/BrandLogo'
import ThemeToggle from '@/components/ThemeToggle'
import LanguageToggle from '@/components/LanguageToggle'
import PortalLogin from './PortalLogin'
import PortalCheckEmail from './PortalCheckEmail'
import PortalDashboard from './PortalDashboard'
import PortalSessionMonitor from './PortalSessionMonitor'
import {
  loadPortalSession,
  savePortalSession,
  getPortalSessionExpSeconds,
} from './portalSession'

type View = 'loading' | 'login' | 'check-email' | 'dashboard'

export default function PortalClient() {
  const t = useTranslations('portal')
  const searchParams = useSearchParams()
  const [view, setView] = useState<View>('loading')
  const [token, setToken] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [expiredNotice, setExpiredNotice] = useState(false)
  const noticeShownRef = useRef(false)

  // Initial load: hydrate token from sessionStorage; honor ?expired=1
  useEffect(() => {
    if (searchParams?.get('expired') === '1' && !noticeShownRef.current) {
      noticeShownRef.current = true
      setExpiredNotice(true)
    }
    const stored = loadPortalSession()
    if (stored) {
      setToken(stored)
      setView('dashboard')
    } else {
      setView('login')
    }
  }, [searchParams])

  const handleLogout = useCallback(() => {
    savePortalSession(null)
    setToken(null)
    setView('login')
  }, [])

  const handleSessionTimeout = useCallback(() => {
    savePortalSession(null)
    setToken(null)
    setExpiredNotice(true)
    setView('login')
  }, [])

  const handleSubmitted = useCallback((email: string) => {
    setSubmittedEmail(email)
    setView('check-email')
  }, [])

  // Inactivity TTL: derive from JWT exp (= server-side client session TTL).
  const inactivityMs = (() => {
    if (!token) return undefined
    const exp = getPortalSessionExpSeconds(token)
    if (!exp) return undefined
    const remainingMs = exp * 1000 - Date.now()
    return remainingMs > 0 ? remainingMs : undefined
  })()

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="fixed top-3 right-3 z-20 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="min-h-dvh flex flex-col items-center justify-center p-4 gap-6">
        <BrandLogo height={56} className="mx-auto" />

        {expiredNotice && view === 'login' && (
          <div className="w-full max-w-md rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {t('sessionExpired')}
          </div>
        )}

        {view === 'loading' && (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        )}

        {view === 'login' && (
          <div className="w-full max-w-md">
            <PortalLogin onSubmitted={handleSubmitted} />
          </div>
        )}

        {view === 'check-email' && (
          <div className="w-full max-w-md">
            <PortalCheckEmail
              email={submittedEmail}
              onBack={() => setView('login')}
            />
          </div>
        )}

        {view === 'dashboard' && token && (
          <PortalDashboard token={token} onLogout={handleLogout} />
        )}
      </div>

      {view === 'dashboard' && token && (
        <PortalSessionMonitor
          inactivityTimeoutMs={inactivityMs}
          onTimeout={handleSessionTimeout}
        />
      )}
    </div>
  )
}
