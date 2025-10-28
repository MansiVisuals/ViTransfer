'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Secure Session Monitor - JWT Best Practices
 *
 * SECURITY STRATEGY:
 *
 * 1. ACCESS TOKEN: 15 minutes (short-lived)
 *    - Limits damage if token is stolen
 *    - Automatically refreshed while user is active
 *
 * 2. REFRESH TOKEN: 3 days (long-lived)
 *    - HttpOnly cookie (JavaScript can't access)
 *    - Rotated on each refresh (old token revoked)
 *    - Fingerprinted (detects token theft)
 *
 * 3. AUTOMATIC REFRESH:
 *    - Refresh every 10 minutes if user is active
 *    - Only refresh if user has interacted recently
 *    - Prevents unnecessary server load
 *
 * 4. INACTIVITY LOGOUT:
 *    - After 15 minutes of no activity
 *    - Warning at 2 minutes before logout
 *    - Clear warning: tokens refreshed on activity
 *
 * NO TOKEN SENT FROM CLIENT:
 * - Tokens are in HttpOnly cookies
 * - Client just triggers refresh endpoint
 * - Server handles all token validation
 */

const INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes
const WARNING_TIME = 2 * 60 * 1000 // Show warning 2 minutes before
const REFRESH_INTERVAL = 10 * 60 * 1000 // Refresh every 10 minutes if active
const CHECK_INTERVAL = 30 * 1000 // Check every 30 seconds

export default function SessionMonitor() {
  const router = useRouter()
  const [showWarning, setShowWarning] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let lastActivity = Date.now()
    let lastRefresh = Date.now()
    let checkInterval: NodeJS.Timeout
    let refreshInterval: NodeJS.Timeout

    // Automatic token refresh while user is active
    const refreshToken = async () => {
      const timeSinceActivity = Date.now() - lastActivity
      const timeSinceRefresh = Date.now() - lastRefresh

      // Only refresh if:
      // 1. User has been active recently (within last 15 min)
      // 2. Haven't refreshed in the last 10 min
      if (timeSinceActivity < INACTIVITY_TIMEOUT && timeSinceRefresh >= REFRESH_INTERVAL) {
        if (refreshing) return // Prevent concurrent refreshes

        try {
          setRefreshing(true)
          const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
          })

          if (response.ok) {
            lastRefresh = Date.now()
            console.log('[SESSION] Token refreshed successfully')
          } else if (response.status === 401 || response.status === 403) {
            // Refresh token invalid/expired or security violation
            console.log('[SESSION] Refresh failed - logging out')
            router.push('/api/auth/logout')
          }
        } catch (error) {
          console.error('[SESSION] Refresh error:', error)
        } finally {
          setRefreshing(false)
        }
      }
    }

    // Reset activity timer on user interaction
    // IMPORTANT: If warning is showing and user interacts, refresh token immediately
    const resetActivity = async () => {
      const wasShowingWarning = showWarning
      lastActivity = Date.now()
      setShowWarning(false)

      // If user was seeing warning and now interacts, refresh token immediately
      // This ensures the session is extended right away, not waiting for next interval
      if (wasShowingWarning) {
        const timeSinceRefresh = Date.now() - lastRefresh
        // Only refresh if haven't refreshed very recently (prevent spam)
        if (timeSinceRefresh >= 30 * 1000) { // 30 seconds minimum between refreshes
          console.log('[SESSION] User activity during warning - refreshing token immediately')
          await refreshToken()
        }
      }
    }

    // Activity events
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ]

    // Add activity listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, resetActivity, { passive: true, capture: true })
    })

    // Check session status periodically
    checkInterval = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivity
      const timeUntilLogout = INACTIVITY_TIMEOUT - timeSinceActivity

      if (timeUntilLogout <= 0) {
        // Inactivity timeout - logout
        console.log('[SESSION] Inactivity timeout - logging out')
        router.push('/api/auth/logout')
      } else if (timeUntilLogout <= WARNING_TIME) {
        // Show warning
        setShowWarning(true)
        setTimeRemaining(Math.ceil(timeUntilLogout / 1000))
      } else {
        setShowWarning(false)
      }
    }, CHECK_INTERVAL)

    // Refresh tokens periodically while active
    refreshInterval = setInterval(refreshToken, REFRESH_INTERVAL)

    // Initial refresh check (in case page was just loaded)
    refreshToken()

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, resetActivity, { capture: true } as any)
      })
      clearInterval(checkInterval)
      clearInterval(refreshInterval)
    }
  }, [router, refreshing, showWarning])

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
