export function sanitizeLogValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

function stringifyLogPart(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatLogParts(parts: unknown[]): string {
  return parts
    .filter((part) => part !== undefined)
    .map((part) => sanitizeLogValue(stringifyLogPart(part)))
    .join(' ')
}

export function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeLogValue(`${error.name}: ${error.message}`)
  }

  if (typeof error === 'string') {
    return sanitizeLogValue(error)
  }

  try {
    return sanitizeLogValue(JSON.stringify(error))
  } catch {
    return 'Unknown error'
  }
}

export function logMessage(message: string, ...extra: unknown[]): void {
  const output = formatLogParts([message, ...extra])
  console.log(sanitizeLogValue(output))
}

export function logInfo(message: string, ...extra: unknown[]): void {
  const output = formatLogParts([message, ...extra])
  console.info(sanitizeLogValue(output))
}

export function logWarn(message: string, ...extra: unknown[]): void {
  const output = formatLogParts([message, ...extra])
  console.warn(sanitizeLogValue(output))
}

export function logDebug(message: string, ...extra: unknown[]): void {
  const output = formatLogParts([message, ...extra])
  console.debug(sanitizeLogValue(output))
}

export function logError(message: string, error?: unknown, ...extra: unknown[]): void {
  const sanitizedMessage = sanitizeLogValue(message).replace(/:\s*$/, '')

  if (error === undefined && extra.length === 0) {
    console.error(sanitizeLogValue(sanitizedMessage))
    return
  }

  if (extra.length === 0) {
    const errorLine = `${sanitizedMessage}: ${formatErrorForLog(error)}`
    console.error(sanitizeLogValue(errorLine))
    return
  }

  const output = formatLogParts([`${sanitizedMessage}:`, error, ...extra])
  console.error(sanitizeLogValue(output))
}
