import type { HttpRequest, HttpResponse } from 'tus-js-client'
import { attemptRefresh } from './api-client'

/** Track per-upload auth refresh attempts to prevent infinite retry loops */
const authRetryCounters = new WeakMap<object, number>()
const MAX_AUTH_RETRIES = 2

/**
 * TUS `onAfterResponse` handler that refreshes the access token on 401/403.
 * TUS awaits this before deciding whether to retry, so the refreshed token
 * is available by the time `onBeforeRequest` runs for the retry.
 */
export function createTusAfterResponseHandler(uploadRef: { current: object | null }) {
  return async (_req: HttpRequest, res: HttpResponse) => {
    const status = res.getStatus()
    if (status !== 401 && status !== 403) return

    const upload = uploadRef.current
    if (!upload) return

    const attempts = authRetryCounters.get(upload) ?? 0
    if (attempts >= MAX_AUTH_RETRIES) return

    authRetryCounters.set(upload, attempts + 1)
    await attemptRefresh()
  }
}

/**
 * TUS `onShouldRetry` handler that allows retry on 401/403 (after token refresh)
 * in addition to the default retry behaviour for 5xx/network errors.
 */
export function createTusShouldRetryHandler(uploadRef: { current: object | null }) {
  return (err: any, _retryAttempt: number, _options: any): boolean => {
    const status = err?.originalResponse?.getStatus?.() ?? 0

    // Allow retry on auth errors if we haven't exhausted refresh attempts
    if (status === 401 || status === 403) {
      const upload = uploadRef.current
      if (!upload) return false
      const attempts = authRetryCounters.get(upload) ?? 0
      return attempts <= MAX_AUTH_RETRIES
    }

    // Default: retry on network errors and 5xx, not other 4xx (except 409/423)
    if (status === 409 || status === 423) return true
    if (status >= 400 && status < 500) return false
    return true
  }
}

/**
 * Reset the auth retry counter for an upload (call on success or when done).
 */
export function resetTusAuthRetry(upload: object | null) {
  if (upload) authRetryCounters.delete(upload)
}

/**
 * Convert low-level tus-js-client errors into user-facing upload messages.
 */
export function getTusUploadErrorMessage(error: unknown): string {
  const err = error as any
  const originalResponse = err?.originalResponse

  const statusFromResponse = Number(originalResponse?.getStatus?.())
  const message = String(err?.message || '')
  const body = safeString(originalResponse?.getBody?.())
  const combined = `${message}\n${body}`

  const statusFromMessageMatch = combined.match(/\bresponse code:\s*(\d{3})\b/i)
  const status = Number.isFinite(statusFromResponse)
    ? statusFromResponse
    : statusFromMessageMatch
      ? Number.parseInt(statusFromMessageMatch[1], 10)
      : null

  if (combined.includes('NetworkError') || combined.includes('Failed to fetch')) {
    return 'Network error. Please check your connection and try again.'
  }

  if (status === 413 || combined.includes('maximum allowed size')) {
    const sizeMatch = combined.match(/maximum allowed size of\s*([0-9.]+\s*(?:KB|MB|GB|TB))/i)
    if (sizeMatch?.[1]) {
      return `File is too large. Maximum allowed size is ${sizeMatch[1]}.`
    }
    return 'File is too large. Please choose a smaller file.'
  }

  if (status === 401 || status === 403) {
    return 'Authentication failed. Please log in again.'
  }

  if (status === 404) {
    return 'Upload endpoint not found. Please contact support if this continues.'
  }

  if (status === 410) {
    return 'Upload session expired. Please restart the upload.'
  }

  if (status && status >= 500) {
    return 'Server error during upload. Please try again.'
  }

  return 'Upload failed. Please try again.'
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}
