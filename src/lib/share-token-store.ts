'use client'

const PREFIX = 'share_token:'
const EXPIRY_SKEW_SECONDS = 5

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    // Base64url -> base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function validateShareToken(token: string): { valid: boolean; expired: boolean } {
  const payload = decodeJwtPayload(token)
  if (!payload) return { valid: false, expired: false }

  // Share tokens in this codebase are JWTs with type='share'.
  if (payload.type !== 'share') return { valid: false, expired: false }

  const exp = payload?.exp
  if (typeof exp !== 'number') return { valid: false, expired: false }

  const nowSeconds = Math.floor(Date.now() / 1000)
  return {
    valid: true,
    expired: exp <= nowSeconds + EXPIRY_SKEW_SECONDS,
  }
}

export function loadShareToken(slug: string): string | null {
  if (!slug) return null
  try {
    const key = PREFIX + slug
    const token = sessionStorage.getItem(key)
    if (!token) return null

    // Drop malformed/expired share token before first network request.
    // This prevents avoidable 401 + manual refresh scenarios on first load.
    const validation = validateShareToken(token)
    if (!validation.valid || validation.expired) {
      sessionStorage.removeItem(key)
      return null
    }

    return token
  } catch {
    return null
  }
}

export function saveShareToken(slug: string, token: string | null) {
  if (!slug) return
  try {
    if (token) {
      sessionStorage.setItem(PREFIX + slug, token)
    } else {
      sessionStorage.removeItem(PREFIX + slug)
    }
  } catch {
    // ignore storage failures
  }
}
