'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '@/lib/token-store'

const INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes
const CHECK_INTERVAL = 30 * 1000 // 30 seconds
const REFRESH_INTERVAL = 10 * 60 * 1000 // 10 minutes

export default function SessionMonitor() {
  const router = useRouter()
  const [showWarning, setShowWarning] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const lastActivityRef = useRef<number>(Date.now())
  const lastRefreshRef = useRef<number>(Date.now())

  useEffect(() => {
    const onActivity = () => {
      lastActivityRef.current = Date.now()
      setShowWarning(false)
    }

    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    activityEvents.forEach(event => {
      document.addEventListener(event, onActivity, { passive: true, capture: true })
    })

    const inactivityTimer = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current
      const timeUntilLogout = INACTIVITY_TIMEOUT - timeSinceActivity

      if (timeUntilLogout <= 0) {
        handleLogout()
      } else if (timeUntilLogout <= 2 * 60 * 1000) {
        setShowWarning(true)
        setTimeRemaining(Math.ceil(timeUntilLogout / 1000))
      } else {
        setShowWarning(false)
      }
    }, CHECK_INTERVAL)

    const refreshTimer = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current
      const timeSinceRefresh = Date.now() - lastRefreshRef.current
      if (timeSinceActivity < INACTIVITY_TIMEOUT && timeSinceRefresh >= REFRESH_INTERVAL) {
        refreshTokens()
      }
    }, CHECK_INTERVAL)

    refreshTokens() // initial

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, onActivity, { capture: true } as any)
      })
      clearInterval(inactivityTimer)
      clearInterval(refreshTimer)
    }
  }, [])

  async function refreshTokens() {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
      })

      if (!response.ok) {
        handleLogout()
        return
      }

      const data = await response.json()
      if (data?.tokens?.accessToken && data?.tokens?.refreshToken) {
        setTokens({
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
        })
        lastRefreshRef.current = Date.now()
      }
    } catch (error) {
      // ignore transient failures
    }
  }

  async function handleLogout() {
    const accessToken = getAccessToken()
    const refreshToken = getRefreshToken()
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(refreshToken ? { 'X-Refresh-Token': `Bearer ${refreshToken}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      })
    } catch (error) {
      // ignore
    } finally {
      clearTokens()
      router.push('/login?sessionExpired=true')
    }
  }

  if (!showWarning) {
    return null
  }

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
            <h3 className="text-sm font-semibold text-warning">
              Inactivity Warning
            </h3>
            <p className="text-sm text-warning font-medium mt-1">
              You will be logged out in {minutes}:{seconds.toString().padStart(2, '0')} due to inactivity.
            </p>
            <p className="text-xs text-warning font-medium mt-2">
              Click anywhere or move your mouse to stay logged in.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
