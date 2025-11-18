import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { getUserPasskeys } from '@/lib/passkey'
import { rateLimit } from '@/lib/rate-limit'

/**
 * List User's PassKeys
 *
 * GET /api/auth/passkey/list
 *
 * SECURITY:
 * - Requires admin authentication (JWT)
 * - Returns only current user's passkeys
 *
 * Returns:
 * - Array of passkeys with metadata (no sensitive crypto material)
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    const user = await requireApiAdmin(request)
    if (user instanceof Response) return user

    // Rate limiting: 60 requests per minute
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 60,
      message: 'Too many requests. Please slow down.'
    }, 'passkey-list')

    if (rateLimitResult) {
      return rateLimitResult
    }

    // Get user's passkeys
    const passkeys = await getUserPasskeys(user.id)

    return NextResponse.json({ passkeys })
  } catch (error) {
    console.error('[PASSKEY] List error:', error)

    return NextResponse.json(
      { error: 'Failed to retrieve passkeys' },
      { status: 500 }
    )
  }
}
