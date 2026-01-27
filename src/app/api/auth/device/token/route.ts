export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getDeviceCodeStatus, consumeDeviceCode, checkPollRate } from '@/lib/device-code'
import { issueAdminTokens } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'

/**
 * POST /api/auth/device/token
 *
 * Token polling endpoint for the device authorization flow.
 * The plugin polls this endpoint until the user authorizes or the code expires.
 *
 * Input: { deviceCode, clientId }
 * Responses:
 *   400 { error: "authorization_pending" }
 *   400 { error: "slow_down", interval: 10 }
 *   400 { error: "expired_token" }
 *   400 { error: "access_denied" }
 *   200 { tokens: {...}, user: {...} }
 */
export async function POST(request: NextRequest) {
  const ipAddress = getClientIpAddress(request)

  // Rate limit: 120 requests per 10 minutes per IP (polling at 5s = 120 in 10min)
  const rateLimitResult = await rateLimit(request, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 120,
    message: 'Too many token requests.',
  }, 'device-token')

  if (rateLimitResult) {
    void logSecurityEvent({
      type: 'DEVICE_CODE_RATE_LIMIT_HIT',
      severity: 'WARNING',
      ipAddress,
      details: { endpoint: 'device/token' },
      wasBlocked: true,
    })
    return rateLimitResult
  }

  try {
    const body = await request.json()
    const { deviceCode, clientId } = body

    if (!deviceCode || !clientId) {
      return NextResponse.json(
        { error: 'device_code and client_id are required' },
        { status: 400 }
      )
    }

    // Check poll rate
    const tooFast = await checkPollRate(deviceCode)
    if (tooFast) {
      return NextResponse.json(
        { error: 'slow_down', interval: 10 },
        { status: 400 }
      )
    }

    // Get device code status
    const codeData = await getDeviceCodeStatus(deviceCode)

    if (!codeData) {
      return NextResponse.json(
        { error: 'expired_token' },
        { status: 400 }
      )
    }

    // Verify client ID matches
    if (codeData.clientId !== clientId) {
      return NextResponse.json(
        { error: 'invalid_client' },
        { status: 400 }
      )
    }

    switch (codeData.status) {
      case 'pending':
        return NextResponse.json(
          { error: 'authorization_pending' },
          { status: 400 }
        )

      case 'denied':
        return NextResponse.json(
          { error: 'access_denied' },
          { status: 400 }
        )

      case 'expired':
        return NextResponse.json(
          { error: 'expired_token' },
          { status: 400 }
        )

      case 'consumed':
        return NextResponse.json(
          { error: 'expired_token' },
          { status: 400 }
        )

      case 'authorized': {
        // Consume the device code (one-time use)
        const result = await consumeDeviceCode(deviceCode)
        if (!result) {
          return NextResponse.json(
            { error: 'expired_token' },
            { status: 400 }
          )
        }

        // Look up user
        const user = await prisma.user.findUnique({
          where: { id: result.userId },
          select: { id: true, email: true, name: true, role: true },
        })

        if (!user) {
          return NextResponse.json(
            { error: 'access_denied' },
            { status: 400 }
          )
        }

        // Issue tokens
        const tokenData = await issueAdminTokens(user)

        // Log successful token issuance
        void logSecurityEvent({
          type: 'DEVICE_CODE_TOKEN_ISSUED',
          severity: 'INFO',
          ipAddress,
          details: {
            userId: user.id,
            userEmail: user.email,
            clientId,
          },
          wasBlocked: false,
        })

        return NextResponse.json({
          tokens: {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            accessExpiresAt: tokenData.accessExpiresAt,
            refreshExpiresAt: tokenData.refreshExpiresAt,
          },
          user: {
            email: user.email,
            name: user.name,
            role: user.role,
          },
        })
      }

      default:
        return NextResponse.json(
          { error: 'authorization_pending' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Device Token] Error polling device token:', error)
    return NextResponse.json(
      { error: 'server_error' },
      { status: 500 }
    )
  }
}
