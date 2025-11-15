import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { getUserPasskeys } from '@/lib/passkey'

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
