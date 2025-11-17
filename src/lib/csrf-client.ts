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
 * Token cached for 50 minutes (expires in 60)
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
    // Cache for 50 minutes (token expires in 60)
    tokenExpiry = Date.now() + 50 * 60 * 1000

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
