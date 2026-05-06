'use client'

// Stored in localStorage (not sessionStorage) so that opening a project from the
// portal in a NEW TAB (target="_blank" rel="noopener noreferrer") still has access
// to the portal session for the bypass-OTP "portal-claim" exchange. Security is
// preserved by: short JWT exp, Redis denylist on logout, server-side recipient
// re-check on every claim, and the inactivity monitor.
const STORAGE_KEY = 'portal_session'
const EXPIRY_SKEW_SECONDS = 5

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function loadPortalSession(): string | null {
  try {
    const token = localStorage.getItem(STORAGE_KEY)
    if (!token) return null
    const payload = decodeJwtPayload(token)
    if (!payload || payload.type !== 'portal' || typeof payload.exp !== 'number') {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp <= now + EXPIRY_SKEW_SECONDS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return token
  } catch {
    return null
  }
}

export function savePortalSession(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // ignore
  }
}

export function getPortalSessionExpSeconds(token: string): number | null {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.exp !== 'number') return null
  return payload.exp
}
