import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { getRateLimitedEntries, clearRateLimitByKey, clearAllRateLimits } from '@/lib/rate-limit'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/security/rate-limits
 *
 * Get all currently rate-limited entries
 * ADMIN ONLY
 */
export async function GET(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const securityMessages = messages?.security || {}

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
      { error: securityMessages.failedToFetchRateLimitEntries || 'Failed to fetch rate limit entries' },
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
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const securityMessages = messages?.security || {}

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
        message: (securityMessages.clearedRateLimitEntries || 'Cleared {count} rate limit {entryLabel}').replace('{count}', String(cleared)).replace('{entryLabel}', cleared === 1 ? (securityMessages.rateLimitEntrySingular || 'entry') : (securityMessages.rateLimitEntryPlural || 'entries')),
        cleared,
      })
    }

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: securityMessages.rateLimitKeyRequired || 'Rate limit key is required' },
        { status: 400 }
      )
    }

    const deleted = await clearRateLimitByKey(key)

    if (deleted === -1) {
      return NextResponse.json(
        { error: securityMessages.failedToClearRateLimitEntryRedisError || 'Failed to clear rate limit entry (Redis error)' },
        { status: 500 }
      )
    }

    if (deleted === 0) {
      return NextResponse.json({
        success: true,
        message: securityMessages.rateLimitKeyExpiredOrNotFound || 'Rate limit key was already expired or not found',
        deleted: 0,
      })
    }

    return NextResponse.json({
      success: true,
      message: securityMessages.rateLimitEntryClearedSuccessfully || 'Rate limit entry cleared successfully',
      deleted,
    })
  } catch (error) {
    console.error('Error clearing rate limit:', error)
    return NextResponse.json(
      { error: securityMessages.failedToClearRateLimit || 'Failed to clear rate limit' },
      { status: 500 }
    )
  }
}
