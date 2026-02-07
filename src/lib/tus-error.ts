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
