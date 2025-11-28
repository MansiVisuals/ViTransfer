'use client'

const PREFIX = 'share_token:'

export function loadShareToken(slug: string): string | null {
  if (!slug) return null
  try {
    return sessionStorage.getItem(PREFIX + slug)
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
