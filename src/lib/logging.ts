export function sanitizeLogValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
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

export function logMessage(message: string): void {
  console.error(sanitizeLogValue(message))
}

export function logError(message: string, error: unknown): void {
  const sanitizedMessage = sanitizeLogValue(message).replace(/:\s*$/, '')
  console.error(`${sanitizedMessage}: ${formatErrorForLog(error)}`)
}