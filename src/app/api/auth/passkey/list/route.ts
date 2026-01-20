import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { getUserPasskeys } from '@/lib/passkey'
import { rateLimit } from '@/lib/rate-limit'
export const runtime = 'nodejs'




/**
 * List User's PassKeys
 *
 * GET /api/auth/passkey/list?userId=<optional>
 *
 * SECURITY:
 * - Requires admin authentication (JWT)
 * - If userId is provided, returns that user's passkeys (admin can manage others' passkeys)
 * - If userId is not provided, returns current user's passkeys
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

    // Get userId from query params (optional - defaults to current user)
    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId') || user.id

    // Get user's passkeys
    const passkeys = await getUserPasskeys(targetUserId)

    return NextResponse.json({ passkeys })
  } catch (error) {
    console.error('[PASSKEY] List error:', error)

    return NextResponse.json(
      { error: 'Failed to retrieve passkeys' },
      { status: 500 }
    )
  }
}
