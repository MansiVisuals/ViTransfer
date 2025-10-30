/**
 * Secure API Client with Automatic Session Handling
 *
 * Industry best practice: Global fetch wrapper that handles:
 * 1. Automatic logout on 401/403 (session expired/revoked)
 * 2. Consistent error handling across the app
 * 3. Proper credentials handling (HttpOnly cookies)
 *
 * Used by: GitHub, AWS Console, Stripe, and most modern web apps
 *
 * Usage:
 *   import { apiFetch } from '@/lib/api-client'
 *   const data = await apiFetch('/api/projects')
 */

// Track if we're already redirecting to prevent multiple redirects
let isRedirecting = false

/**
 * Enhanced fetch wrapper with automatic session handling
 *
 * @param input - URL or Request object
 * @param init - Fetch options
 * @returns Promise that resolves to Response
 *
 * Automatic behaviors:
 * - 401/403: Clears state and redirects to login
 * - Always includes credentials (for HttpOnly cookies)
 * - Prevents multiple simultaneous redirects
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Default options: always include credentials for HttpOnly cookies
  const options: RequestInit = {
    ...init,
    credentials: 'include',
  }

  try {
    const response = await fetch(input, options)

    // Handle authentication errors (session expired/revoked)
    if ((response.status === 401 || response.status === 403) && !isRedirecting) {
      // Check if this is an auth endpoint (don't redirect on login failures)
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const isAuthEndpoint = url.includes('/api/auth/login') ||
                            url.includes('/api/auth/session') ||
                            url.includes('/api/share/')

      if (!isAuthEndpoint) {
        handleSessionExpired()
      }
    }

    return response
  } catch (error) {
    // Network errors, CORS issues, etc.
    console.error('[API] Request failed:', error)
    throw error
  }
}

/**
 * Handle session expiration/revocation
 * - Clear local storage and session storage
 * - Redirect to login page
 * - Prevent multiple simultaneous redirects
 */
function handleSessionExpired() {
  if (isRedirecting) return
  isRedirecting = true

  // Clear any client-side storage (defense in depth)
  try {
    localStorage.removeItem('vitransfer_preferences')
    sessionStorage.clear()
  } catch (error) {
    // Storage might not be available - silent fail
  }

  // Hard redirect to clear all React state
  // Using window.location.href ensures:
  // - Full page reload (clears all cached data)
  // - All React state is cleared
  // - Any pending requests are cancelled
  window.location.href = '/login?sessionExpired=true'
}

/**
 * Convenience wrapper for JSON API calls
 * Automatically parses JSON response
 *
 * @param input - URL or Request object
 * @param init - Fetch options
 * @returns Promise that resolves to parsed JSON data
 */
export async function apiJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await apiFetch(input, init)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

/**
 * Helper for POST requests with JSON body
 */
export async function apiPost<T = any>(
  url: string,
  data: any,
  init?: RequestInit
): Promise<T> {
  return apiJson<T>(url, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    body: JSON.stringify(data),
  })
}

/**
 * Helper for PATCH requests with JSON body
 */
export async function apiPatch<T = any>(
  url: string,
  data: any,
  init?: RequestInit
): Promise<T> {
  return apiJson<T>(url, {
    ...init,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    body: JSON.stringify(data),
  })
}

/**
 * Helper for DELETE requests
 */
export async function apiDelete<T = any>(
  url: string,
  init?: RequestInit
): Promise<T> {
  return apiJson<T>(url, {
    ...init,
    method: 'DELETE',
  })
}
