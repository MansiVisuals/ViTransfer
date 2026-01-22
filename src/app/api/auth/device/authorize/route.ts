export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authorizeDeviceCode } from '@/lib/device-code'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

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
  // Rate limit: 20 requests per 10 minutes
  const rateLimitResult = await rateLimit(request, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 20,
    message: 'Too many authorization attempts.',
  }, 'device-authorize')

  if (rateLimitResult) return rateLimitResult

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
      return NextResponse.json(
        { error: result.error || 'Authorization failed' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Device Authorize] Error authorizing device:', error)
    return NextResponse.json(
      { error: 'Failed to authorize device' },
      { status: 500 }
    )
  }
}
