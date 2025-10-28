import { NextResponse } from 'next/server'

export const GENERIC_ERRORS = {
  BAD_REQUEST: 'Invalid request',
  INVALID_INPUT: 'Invalid input provided',
  UNAUTHORIZED: 'Authentication required',
  INVALID_CREDENTIALS: 'Invalid credentials',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Not found',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  SERVER_ERROR: 'Unable to process request',
  OPERATION_FAILED: 'Operation failed',
} as const

export interface ErrorHandlerOptions {
  error: unknown
  clientMessage: string
  status: number
  context?: {
    endpoint?: string
    userId?: string
    action?: string
    [key: string]: any
  }
}

export function handleApiError(options: ErrorHandlerOptions): NextResponse {
  const { error, clientMessage, status, context } = options
  
  const logData = {
    timestamp: new Date().toISOString(),
    clientMessage,
    status,
    context,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : String(error)
  }
  
  console.error('API Error:', JSON.stringify(logData, null, 2))
  
  return NextResponse.json(
    { error: clientMessage },
    { status }
  )
}

export const ErrorResponses = {
  AUTH_REQUIRED: {
    clientMessage: 'Authentication required',
    status: 401
  },
  
  AUTH_INVALID: {
    clientMessage: 'Invalid credentials',
    status: 401
  },
  
  AUTH_EXPIRED: {
    clientMessage: 'Authentication required',
    status: 401
  },
  
  FORBIDDEN: {
    clientMessage: 'Access denied',
    status: 403
  },
  
  ACCESS_DENIED: {
    clientMessage: 'Access denied',
    status: 403
  },
  
  NOT_FOUND: {
    clientMessage: 'Not found',
    status: 404
  },
  
  INVALID_INPUT: {
    clientMessage: 'Invalid input',
    status: 400
  },
  
  MISSING_FIELD: {
    clientMessage: 'Invalid input',
    status: 400
  },
  
  RATE_LIMIT: {
    clientMessage: 'Too many requests',
    status: 429
  },
  
  INTERNAL_ERROR: {
    clientMessage: 'Unable to process request',
    status: 500
  },
  
  SERVER_ERROR: {
    clientMessage: 'Unable to process request',
    status: 500
  },
  
  CONTENT_TOO_LARGE: {
    clientMessage: 'Content too large',
    status: 413
  },
  
  INVALID_FORMAT: {
    clientMessage: 'Invalid format',
    status: 400
  },
  
  OPERATION_FAILED: {
    clientMessage: 'Operation failed',
    status: 500
  },
  
  SERVICE_UNAVAILABLE: {
    clientMessage: 'Service temporarily unavailable',
    status: 503
  },
  
  CONFLICT: {
    clientMessage: 'Request conflict',
    status: 409
  }
} as const

export function createErrorResponse(
  errorType: keyof typeof ErrorResponses,
  error: unknown,
  context?: ErrorHandlerOptions['context']
): NextResponse {
  const errorConfig = ErrorResponses[errorType]
  
  return handleApiError({
    error,
    clientMessage: errorConfig.clientMessage,
    status: errorConfig.status,
    context
  })
}

export function validationErrorResponse(details: string[]): NextResponse {
  return NextResponse.json(
    { 
      error: 'Validation failed',
      details
    },
    { status: 400 }
  )
}
