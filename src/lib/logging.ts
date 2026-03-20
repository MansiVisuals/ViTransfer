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

const isServer = typeof process !== 'undefined' && typeof process.stdout?.write === 'function'

function writeStdout(line: string): void {
  if (isServer) {
    process.stdout.write(sanitizeLogValue(line) + '\n')
  } else {
    console.log(sanitizeLogValue(line))
  }
}

function writeStderr(line: string): void {
  if (isServer) {
    process.stderr.write(sanitizeLogValue(line) + '\n')
  } else {
    console.error(sanitizeLogValue(line))
  }
}

export function logMessage(message: string, ...extra: unknown[]): void {
  writeStdout(sanitizeLogValue(formatLogParts([message, ...extra])))
}

export function logInfo(message: string, ...extra: unknown[]): void {
  writeStdout(sanitizeLogValue(formatLogParts([message, ...extra])))
}

export function logWarn(message: string, ...extra: unknown[]): void {
  writeStderr(sanitizeLogValue(formatLogParts([message, ...extra])))
}

export function logDebug(message: string, ...extra: unknown[]): void {
  writeStdout(sanitizeLogValue(formatLogParts([message, ...extra])))
}

export function logError(message: string, error?: unknown, ...extra: unknown[]): void {
  const sanitizedMessage = sanitizeLogValue(message).replace(/:\s*$/, '')

  if (error === undefined && extra.length === 0) {
    writeStderr(sanitizeLogValue(sanitizedMessage))
    return
  }

  if (extra.length === 0) {
    writeStderr(sanitizeLogValue(`${sanitizedMessage}: ${formatErrorForLog(error)}`))
    return
  }

  writeStderr(sanitizeLogValue(formatLogParts([`${sanitizedMessage}:`, error, ...extra])))
}
