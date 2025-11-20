/**
 * Client-side CSRF Token Utility
 *
 * Centralized CSRF token fetching for frontend
 * Reusable across all components that make state-changing requests
 */

let cachedToken: string | null = null
let tokenExpiry: number = 0

/**
 * Get CSRF token (cached for performance)
 * Token cached for 10 minutes to minimize stale token usage after session rotations
 */
export async function getCsrfToken(): Promise<string | null> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }

  try {
    const response = await fetch('/api/csrf', { credentials: 'include' })
    if (!response.ok) return null

    const data = await response.json()
    cachedToken = data.csrfToken
    // Cache for 10 minutes (shorter window reduces stale token risk after session refresh)
    tokenExpiry = Date.now() + 10 * 60 * 1000

    return cachedToken
  } catch {
    return null
  }
}

/**
 * Clear cached token (e.g., after logout)
 */
export function clearCsrfToken(): void {
  cachedToken = null
  tokenExpiry = 0
}
