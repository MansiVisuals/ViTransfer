import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { invalidateAllShareSessions, clearAllRateLimits } from '@/lib/session-invalidation'
import { rateLimit } from '@/lib/rate-limit'
export const runtime = 'nodejs'

function adminTimeoutSeconds(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  if (unit === 'MINUTES') return value * 60
  if (unit === 'HOURS') return value * 60 * 60
  return null
}




// Helper functions for change detection
function hasSessionTimeoutChanged(
  current: any,
  newValue?: string,
  newUnit?: string
): boolean {
  if (!current || (newValue === undefined && newUnit === undefined)) return false

  const value = newValue !== undefined ? parseInt(newValue, 10) : current.sessionTimeoutValue
  const unit = newUnit !== undefined ? newUnit : current.sessionTimeoutUnit

  return current.sessionTimeoutValue !== value || current.sessionTimeoutUnit !== unit
}

function hasHotlinkProtectionChanged(current: any, newProtection?: string): boolean {
  if (!current || newProtection === undefined) return false

  const levels: Record<string, number> = { 'DISABLED': 0, 'LOG_ONLY': 1, 'BLOCK_STRICT': 2 }
  const currentLevel = levels[current.hotlinkProtection] || 0
  const newLevel = levels[newProtection] || 0

  return newLevel > currentLevel
}

function hasPasswordAttemptsChanged(current: any, newAttempts?: string): boolean {
  if (!current || newAttempts === undefined) return false
  return current.passwordAttempts !== parseInt(newAttempts, 10)
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: 60 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
  }, 'security-settings-read')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    let settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
    })

    if (!settings) {
      settings = await prisma.securitySettings.create({
        data: {
          id: 'default',
        },
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error fetching security settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch security settings' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const body = await request.json()

    const {
      httpsEnabled,
      hotlinkProtection,
      ipRateLimit,
      sessionRateLimit,
      shareSessionRateLimit,
      shareTokenTtlSeconds,
      passwordAttempts,
      sessionTimeoutValue,
      sessionTimeoutUnit,
      adminSessionTimeoutValue,
      adminSessionTimeoutUnit,
      trackAnalytics,
      trackSecurityLogs,
      viewSecurityEvents,
    } = body

    // Validate required security fields
    if (sessionTimeoutValue !== undefined && sessionTimeoutValue !== null) {
      const timeoutVal = parseInt(sessionTimeoutValue, 10)
      if (isNaN(timeoutVal) || timeoutVal <= 0) {
        return NextResponse.json(
          { error: 'Session timeout value must be a positive number' },
          { status: 400 }
        )
      }
    }

    if (adminSessionTimeoutValue !== undefined && adminSessionTimeoutValue !== null) {
      const timeoutVal = parseInt(adminSessionTimeoutValue, 10)
      if (isNaN(timeoutVal) || timeoutVal <= 0) {
        return NextResponse.json(
          { error: 'Admin session timeout value must be a positive number' },
          { status: 400 }
        )
      }
    }

    if (adminSessionTimeoutUnit !== undefined && adminSessionTimeoutUnit !== null) {
      if (adminSessionTimeoutUnit !== 'MINUTES' && adminSessionTimeoutUnit !== 'HOURS') {
        return NextResponse.json(
          { error: 'Admin session timeout unit must be MINUTES or HOURS' },
          { status: 400 }
        )
      }
    }

    if (passwordAttempts !== undefined && passwordAttempts !== null) {
      const attemptsVal = parseInt(passwordAttempts, 10)
      if (isNaN(attemptsVal) || attemptsVal <= 0 || attemptsVal > 100) {
        return NextResponse.json(
          { error: 'Password attempts must be between 1 and 100' },
          { status: 400 }
        )
      }
    }

    if (shareSessionRateLimit !== undefined && shareSessionRateLimit !== null) {
      const val = parseInt(shareSessionRateLimit, 10)
      if (isNaN(val) || val <= 0 || val > 2000) {
        return NextResponse.json(
          { error: 'Share session rate limit must be between 1 and 2000 requests per window' },
          { status: 400 }
        )
      }
    }

    if (shareTokenTtlSeconds !== undefined && shareTokenTtlSeconds !== null) {
      const val = parseInt(shareTokenTtlSeconds, 10)
      if (isNaN(val) || val <= 60 || val > 24 * 60 * 60) {
        return NextResponse.json(
          { error: 'Share token TTL must be between 60 seconds and 86400 seconds' },
          { status: 400 }
        )
      }
    }

    // Get current settings to detect changes and validate merged values
    const currentSettings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
    })

    if (adminSessionTimeoutValue !== undefined || adminSessionTimeoutUnit !== undefined) {
      const mergedValue =
        adminSessionTimeoutValue !== undefined && adminSessionTimeoutValue !== null
          ? parseInt(adminSessionTimeoutValue, 10)
          : (currentSettings?.adminSessionTimeoutValue ?? 15)
      const mergedUnit =
        adminSessionTimeoutUnit !== undefined && adminSessionTimeoutUnit !== null
          ? String(adminSessionTimeoutUnit)
          : (currentSettings?.adminSessionTimeoutUnit ?? 'MINUTES')

      const seconds = adminTimeoutSeconds(mergedValue, mergedUnit)
      if (!seconds) {
        return NextResponse.json(
          { error: 'Admin session timeout must be a positive number in minutes or hours' },
          { status: 400 }
        )
      }
      if (seconds > 24 * 60 * 60) {
        return NextResponse.json(
          { error: 'Admin session timeout must be 24 hours or less' },
          { status: 400 }
        )
      }
    }

    // Detect security-sensitive changes
    const sessionTimeoutChanged = hasSessionTimeoutChanged(currentSettings, sessionTimeoutValue, sessionTimeoutUnit)
    const hotlinkProtectionChanged = hasHotlinkProtectionChanged(currentSettings, hotlinkProtection)
    const passwordAttemptsChanged = hasPasswordAttemptsChanged(currentSettings, passwordAttempts)

    const settings = await prisma.securitySettings.upsert({
      where: { id: 'default' },
      update: {
        httpsEnabled: httpsEnabled ?? false,
        hotlinkProtection,
        ipRateLimit: ipRateLimit ? parseInt(ipRateLimit, 10) : 1000,
        sessionRateLimit: sessionRateLimit ? parseInt(sessionRateLimit, 10) : 600,
        shareSessionRateLimit: shareSessionRateLimit ? parseInt(shareSessionRateLimit, 10) : 300,
        shareTokenTtlSeconds: shareTokenTtlSeconds ? parseInt(shareTokenTtlSeconds, 10) : null,
        passwordAttempts: passwordAttempts ? parseInt(passwordAttempts, 10) : 5,
        sessionTimeoutValue: sessionTimeoutValue ? parseInt(sessionTimeoutValue, 10) : 15,
        sessionTimeoutUnit: sessionTimeoutUnit || 'MINUTES',
        adminSessionTimeoutValue: adminSessionTimeoutValue ? parseInt(adminSessionTimeoutValue, 10) : 15,
        adminSessionTimeoutUnit: adminSessionTimeoutUnit || 'MINUTES',
        trackAnalytics: trackAnalytics ?? true,
        trackSecurityLogs: trackSecurityLogs ?? true,
        viewSecurityEvents: viewSecurityEvents ?? false,
      },
      create: {
        id: 'default',
        httpsEnabled: httpsEnabled ?? false,
        hotlinkProtection,
        ipRateLimit: ipRateLimit ? parseInt(ipRateLimit, 10) : 1000,
        sessionRateLimit: sessionRateLimit ? parseInt(sessionRateLimit, 10) : 600,
        shareSessionRateLimit: shareSessionRateLimit ? parseInt(shareSessionRateLimit, 10) : 300,
        shareTokenTtlSeconds: shareTokenTtlSeconds ? parseInt(shareTokenTtlSeconds, 10) : null,
        passwordAttempts: passwordAttempts ? parseInt(passwordAttempts, 10) : 5,
        sessionTimeoutValue: sessionTimeoutValue ? parseInt(sessionTimeoutValue, 10) : 15,
        sessionTimeoutUnit: sessionTimeoutUnit || 'MINUTES',
        adminSessionTimeoutValue: adminSessionTimeoutValue ? parseInt(adminSessionTimeoutValue, 10) : 15,
        adminSessionTimeoutUnit: adminSessionTimeoutUnit || 'MINUTES',
        trackAnalytics: trackAnalytics ?? true,
        trackSecurityLogs: trackSecurityLogs ?? true,
        viewSecurityEvents: viewSecurityEvents ?? false,
      },
    })

    // SECURITY: Invalidate sessions when security settings change
    let invalidationLog: string[] = []

    // 1. Session timeout changed → Invalidate ALL share sessions globally
    //    Reason: Existing sessions may exceed new timeout
    if (sessionTimeoutChanged) {
      try {
        const count = await invalidateAllShareSessions()
        invalidationLog.push(`Invalidated ${count} share sessions (timeout changed)`)
        console.log(`[SECURITY] Session timeout changed - invalidated ${count} share sessions`)
      } catch (error) {
        console.error('[SECURITY] Failed to invalidate sessions after timeout change:', error)
        // Don't fail the request if session invalidation fails
      }
    }

    // 2. Hotlink protection became more restrictive → Invalidate ALL share sessions
    //    Reason: New security policy should apply immediately
    if (hotlinkProtectionChanged) {
      try {
        const count = await invalidateAllShareSessions()
        invalidationLog.push(`Invalidated ${count} share sessions (hotlink protection strengthened)`)
        console.log(`[SECURITY] Hotlink protection strengthened - invalidated ${count} share sessions`)
      } catch (error) {
        console.error('[SECURITY] Failed to invalidate sessions after hotlink change:', error)
      }
    }

    // 3. Password attempts changed → Clear all rate limit counters
    //    Reason: New limit should apply to fresh attempts
    if (passwordAttemptsChanged) {
      try {
        const count = await clearAllRateLimits()
        invalidationLog.push(`Cleared ${count} rate limit counters (password attempts changed)`)
        console.log(`[SECURITY] Password attempts changed - cleared ${count} rate limit entries`)
      } catch (error) {
        console.error('[SECURITY] Failed to clear rate limits:', error)
      }
    }

    // Return settings with invalidation summary
    return NextResponse.json({
      ...settings,
      _invalidation: invalidationLog.length > 0 ? invalidationLog : undefined
    })
  } catch (error) {
    console.error('Error updating security settings:', error)
    return NextResponse.json(
      { error: 'Failed to update security settings' },
      { status: 500 }
    )
  }
}
