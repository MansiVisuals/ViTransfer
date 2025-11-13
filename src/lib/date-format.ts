/**
 * Localized date formatting based on timezone environment variable
 *
 * Maps timezone regions to their preferred date formats:
 * - Americas (US) → MM-dd-yyyy
 * - Europe → dd-MM-yyyy
 * - Asia → yyyy-MM-dd (ISO)
 */

type DateFormatPattern = 'MM-dd-yyyy' | 'dd-MM-yyyy' | 'yyyy-MM-dd'

/**
 * Detect date format based on TZ environment variable
 */
function getDateFormatFromTimezone(): DateFormatPattern {
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone

  // US/Americas format (MM-dd-yyyy)
  if (tz.startsWith('America/') || tz.startsWith('US/')) {
    return 'MM-dd-yyyy'
  }

  // European format (dd-MM-yyyy)
  if (tz.startsWith('Europe/') || tz.startsWith('Africa/')) {
    return 'dd-MM-yyyy'
  }

  // Asian/ISO format (yyyy-MM-dd)
  if (tz.startsWith('Asia/') || tz.startsWith('Pacific/')) {
    return 'yyyy-MM-dd'
  }

  // Default to ISO format for unknown timezones
  return 'yyyy-MM-dd'
}

/**
 * Pad number with leading zero
 */
function pad(num: number): string {
  return num.toString().padStart(2, '0')
}

/**
 * Format date according to detected timezone format
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date

  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())

  const format = getDateFormatFromTimezone()

  switch (format) {
    case 'MM-dd-yyyy':
      return `${month}-${day}-${year}`
    case 'dd-MM-yyyy':
      return `${day}-${month}-${year}`
    case 'yyyy-MM-dd':
      return `${year}-${month}-${day}`
  }
}

/**
 * Format date with time according to detected timezone format
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date

  const dateStr = formatDate(d)
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())

  return `${dateStr} ${hours}:${minutes}`
}

/**
 * Get human-readable format description for UI
 */
export function getDateFormatDescription(): string {
  const format = getDateFormatFromTimezone()

  switch (format) {
    case 'MM-dd-yyyy':
      return 'Month-Day-Year (US format)'
    case 'dd-MM-yyyy':
      return 'Day-Month-Year (European format)'
    case 'yyyy-MM-dd':
      return 'Year-Month-Day (ISO format)'
  }
}

/**
 * Example date string for UI display
 */
export function getDateFormatExample(): string {
  const now = new Date()
  return formatDate(now)
}
