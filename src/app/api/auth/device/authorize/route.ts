export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authorizeDeviceCode } from '@/lib/device-code'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'

/**
 * POST /api/auth/device/authorize
 *
 * Browser-side endpoint to authorize a device code.
 * Requires a valid admin access token (user must be authenticated).
 *
 * Input: { userCode: "ABCD-1234" }
 * Output: { success: true }
 */
export async function POST(request: NextRequest) {
  const ipAddress = getClientIpAddress(request)

  // Rate limit: 20 requests per 10 minutes
  const rateLimitResult = await rateLimit(request, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 20,
    message: 'Too many authorization attempts.',
  }, 'device-authorize')

  if (rateLimitResult) {
    void logSecurityEvent({
      type: 'DEVICE_CODE_RATE_LIMIT_HIT',
      severity: 'WARNING',
      ipAddress,
      details: { endpoint: 'device/authorize' },
      wasBlocked: true,
    })
    return rateLimitResult
  }

  try {
    // Require authenticated admin user
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { userCode } = body

    if (!userCode || typeof userCode !== 'string') {
      return NextResponse.json(
        { error: 'User code is required' },
        { status: 400 }
      )
    }

    // Normalize user code (uppercase, trim)
    const normalizedCode = userCode.toUpperCase().trim()

    // Validate format: XXXX-XXXX
    if (!/^[A-Z]{4}-[0-9]{4}$/.test(normalizedCode)) {
      return NextResponse.json(
        { error: 'Invalid user code format. Expected: ABCD-1234' },
        { status: 400 }
      )
    }

    // Authorize the device code
    const result = await authorizeDeviceCode(normalizedCode, user.id)

    if (!result.success) {
      void logSecurityEvent({
        type: 'DEVICE_CODE_AUTH_FAILED',
        severity: 'WARNING',
        ipAddress,
        details: {
          userId: user.id,
          userCode: normalizedCode,
          error: result.error,
        },
        wasBlocked: false,
      })
      return NextResponse.json(
        { error: result.error || 'Authorization failed' },
        { status: 400 }
      )
    }

    // Log successful authorization
    void logSecurityEvent({
      type: 'DEVICE_CODE_AUTHORIZED',
      severity: 'INFO',
      ipAddress,
      details: {
        userId: user.id,
        userEmail: user.email,
        userCode: normalizedCode,
      },
      wasBlocked: false,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Device Authorize] Error authorizing device:', error)
    return NextResponse.json(
      { error: 'Failed to authorize device' },
      { status: 500 }
    )
  }
}
