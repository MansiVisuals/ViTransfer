import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { getPasskeyConfigStatus } from '@/lib/settings'

/**
 * Get PassKey Configuration Status
 *
 * GET /api/auth/passkey/status
 *
 * SECURITY:
 * - Requires admin authentication
 * - Returns detailed config status for admin UI
 *
 * Returns:
 * - available: boolean
 * - reason?: string (if not available)
 * - config?: { domain, httpsEnabled, isLocalhost }
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    const user = await requireApiAdmin(request)
    if (user instanceof Response) return user

    // Get passkey configuration status
    const status = await getPasskeyConfigStatus()

    return NextResponse.json(status)
  } catch (error) {
    console.error('[PASSKEY] Status check error:', error)

    return NextResponse.json(
      {
        available: false,
        reason: 'Failed to check passkey configuration',
      },
      { status: 500 }
    )
  }
}
