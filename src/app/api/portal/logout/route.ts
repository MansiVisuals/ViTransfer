import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { parseBearerToken } from '@/lib/auth'
import {
  verifyPortalSession,
  revokePortalSession,
  remainingPortalTokenSeconds,
} from '@/lib/portal-token'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Mirrors auth/logout — caps denylist-write spam from a stolen JWT.
    const limit = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 60,
      message: 'Too many logout attempts. Please try again later.',
    }, 'portal-logout')
    if (limit) return limit

    const bearer = parseBearerToken(request)
    if (!bearer) {
      return NextResponse.json({ success: true })
    }

    const session = await verifyPortalSession(bearer)
    if (!session) {
      return NextResponse.json({ success: true })
    }

    const remaining = remainingPortalTokenSeconds(session)
    if (remaining > 0) {
      await revokePortalSession(session.sessionId, remaining)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('[PORTAL] logout error:', error)
    return NextResponse.json({ success: true })
  }
}
