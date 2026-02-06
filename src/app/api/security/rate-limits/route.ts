import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { getRateLimitedEntries, clearRateLimitByKey, clearAllRateLimits } from '@/lib/rate-limit'
export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/security/rate-limits
 *
 * Get all currently rate-limited entries
 * ADMIN ONLY
 */
export async function GET(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const entries = await getRateLimitedEntries()

    return NextResponse.json({
      entries,
      count: entries.length,
    })
  } catch (error) {
    console.error('Error fetching rate limit entries:', error)
    return NextResponse.json(
      { error: 'Failed to fetch rate limit entries' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/security/rate-limits
 *
 * Clear specific rate limit entry by key
 * ADMIN ONLY
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const body = await request.json()
    const { key, clearAll } = body

    // Clear ALL rate limits (nuclear option)
    if (clearAll === true) {
      const cleared = await clearAllRateLimits()
      return NextResponse.json({
        success: true,
        message: `Cleared ${cleared} rate limit ${cleared === 1 ? 'entry' : 'entries'}`,
        cleared,
      })
    }

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: 'Rate limit key is required' },
        { status: 400 }
      )
    }

    const deleted = await clearRateLimitByKey(key)

    if (deleted === -1) {
      return NextResponse.json(
        { error: 'Failed to clear rate limit entry (Redis error)' },
        { status: 500 }
      )
    }

    if (deleted === 0) {
      return NextResponse.json({
        success: true,
        message: 'Rate limit key was already expired or not found',
        deleted: 0,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Rate limit entry cleared successfully',
      deleted,
    })
  } catch (error) {
    console.error('Error clearing rate limit:', error)
    return NextResponse.json(
      { error: 'Failed to clear rate limit' },
      { status: 500 }
    )
  }
}
