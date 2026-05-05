'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

const CHECK_INTERVAL = 30 * 1000
const WARNING_WINDOW_MS = 2 * 60 * 1000
const DEFAULT_INACTIVITY_MS = 15 * 60 * 1000

interface Props {
  inactivityTimeoutMs?: number
  onTimeout: () => void
}

export default function PortalSessionMonitor({ inactivityTimeoutMs, onTimeout }: Props) {
  const t = useTranslations('session')
  const [showWarning, setShowWarning] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const lastActivityRef = useRef<number>(Date.now())
  const onTimeoutRef = useRef(onTimeout)

  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  const handleTimeout = useCallback(() => {
    onTimeoutRef.current()
  }, [])

  useEffect(() => {
    const onActivity = () => {
      lastActivityRef.current = Date.now()
      setShowWarning(false)
    }
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    events.forEach((e) => document.addEventListener(e, onActivity, { passive: true, capture: true }))

    const timeoutMs = inactivityTimeoutMs && inactivityTimeoutMs > 0 ? inactivityTimeoutMs : DEFAULT_INACTIVITY_MS

    const timer = setInterval(() => {
      const sinceActivity = Date.now() - lastActivityRef.current
      const untilLogout = timeoutMs - sinceActivity
      if (untilLogout <= 0) {
        handleTimeout()
      } else if (untilLogout <= WARNING_WINDOW_MS) {
        setShowWarning(true)
        setTimeRemaining(Math.ceil(untilLogout / 1000))
      } else {
        setShowWarning(false)
      }
    }, CHECK_INTERVAL)

    return () => {
      events.forEach((e) => document.removeEventListener(e, onActivity, { capture: true } as any))
      clearInterval(timer)
    }
  }, [inactivityTimeoutMs, handleTimeout])

  if (!showWarning) return null

  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-warning-visible border-2 border-warning-visible rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg
              className="w-6 h-6 text-warning"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-warning">{t('inactivityWarning')}</h3>
            <p className="text-sm text-warning font-medium mt-1">
              {t('logoutCountdown', { time: `${minutes}:${seconds.toString().padStart(2, '0')}` })}
            </p>
            <p className="text-xs text-warning font-medium mt-2">{t('stayLoggedIn')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
