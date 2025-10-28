import { NextResponse } from 'next/server'

/**
 * Security Best Practices for API Error Responses
 *
 * To prevent information disclosure and enumeration attacks:
 * - Use generic error messages
 * - Don't reveal if resources exist
 * - Use same status code for "not found" and "not authorized"
 * - Avoid specific error details in production
 */

/**
 * Generic unauthorized response - use for:
 * - No authentication
 * - Invalid authentication
 * - Insufficient permissions
 * - Resource not found (for authenticated resources)
 *
 * This prevents attackers from determining if:
 * - A resource exists
 * - They lack permissions vs resource doesn't exist
 * - An account exists
 */
export function unauthorizedResponse(message: string = 'Unauthorized') {
  return NextResponse.json(
    { error: message },
    { status: 401 }
  )
}

/**
 * Not found response - use only for public resources
 * For authenticated resources, use unauthorizedResponse instead
 */
export function notFoundResponse(message: string = 'Not found') {
  return NextResponse.json(
    { error: message },
    { status: 404 }
  )
}

/**
 * Bad request response
 */
export function badRequestResponse(message: string) {
  return NextResponse.json(
    { error: message },
    { status: 400 }
  )
}

/**
 * Server error response
 */
export function serverErrorResponse(message: string = 'Internal server error') {
  return NextResponse.json(
    { error: message },
    { status: 500 }
  )
}

/**
 * Success response
 */
export function successResponse(data: any, status: number = 200) {
  return NextResponse.json(data, { status })
}

/**
 * Helper to check if user is authorized for a resource
 * Returns generic unauthorized if not found OR not authorized
 * This prevents resource enumeration
 */
export function checkResourceAccess(
  resource: any | null,
  hasPermission: boolean = true
): true | NextResponse {
  if (!resource || !hasPermission) {
    // Same response for "not found" and "no permission" - prevents enumeration
    return unauthorizedResponse()
  }
  return true
}
