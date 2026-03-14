export function sanitizeLogValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
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
  console.log(output)
}

export function logInfo(message: string, ...extra: unknown[]): void {
  const output = formatLogParts([message, ...extra])
  console.info(output)
}

export function logWarn(message: string, ...extra: unknown[]): void {
  const output = formatLogParts([message, ...extra])
  console.warn(output)
}

export function logDebug(message: string, ...extra: unknown[]): void {
  const output = formatLogParts([message, ...extra])
  console.debug(output)
}

export function logError(message: string, error?: unknown, ...extra: unknown[]): void {
  const sanitizedMessage = sanitizeLogValue(message).replace(/:\s*$/, '')

  if (error === undefined && extra.length === 0) {
    console.error(sanitizedMessage)
    return
  }

  if (extra.length === 0) {
    console.error(`${sanitizedMessage}: ${formatErrorForLog(error)}`)
    return
  }

  const output = formatLogParts([`${sanitizedMessage}:`, error, ...extra])
  console.error(output)
}
