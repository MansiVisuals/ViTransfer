import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { invalidateAllSessions, clearAllRateLimits } from '@/lib/session-invalidation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
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
      hotlinkProtection,
      ipRateLimit,
      sessionRateLimit,
      passwordAttempts,
      sessionTimeoutValue,
      sessionTimeoutUnit,
      trackAnalytics,
      trackSecurityLogs,
      viewSecurityEvents,
    } = body

    // Validate required security fields
    if (sessionTimeoutValue !== undefined && sessionTimeoutValue !== null) {
      const timeoutVal = parseInt(sessionTimeoutValue)
      if (isNaN(timeoutVal) || timeoutVal <= 0) {
        return NextResponse.json(
          { error: 'Session timeout value must be a positive number' },
          { status: 400 }
        )
      }
    }

    if (passwordAttempts !== undefined && passwordAttempts !== null) {
      const attemptsVal = parseInt(passwordAttempts)
      if (isNaN(attemptsVal) || attemptsVal <= 0 || attemptsVal > 100) {
        return NextResponse.json(
          { error: 'Password attempts must be between 1 and 100' },
          { status: 400 }
        )
      }
    }

    // Get current settings to detect changes
    const currentSettings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
    })

    // Track which security-sensitive changes occurred
    let sessionTimeoutChanged = false
    let hotlinkProtectionChanged = false
    let passwordAttemptsChanged = false

    if (currentSettings) {
      // Check if session timeout changed (check both value and unit)
      // Handle partial updates: if only one is provided, use current value for the other
      if (sessionTimeoutValue !== undefined || sessionTimeoutUnit !== undefined) {
        const newValue = sessionTimeoutValue !== undefined
          ? parseInt(sessionTimeoutValue)
          : currentSettings.sessionTimeoutValue
        const newUnit = sessionTimeoutUnit !== undefined
          ? sessionTimeoutUnit
          : currentSettings.sessionTimeoutUnit

        sessionTimeoutChanged =
          currentSettings.sessionTimeoutValue !== newValue ||
          currentSettings.sessionTimeoutUnit !== newUnit
      }

      // Check if hotlink protection became more restrictive (only if provided)
      if (hotlinkProtection !== undefined) {
        const restrictionLevels = { 'DISABLED': 0, 'LOG_ONLY': 1, 'BLOCK_STRICT': 2 }
        const currentLevel = restrictionLevels[currentSettings.hotlinkProtection as keyof typeof restrictionLevels] || 0
        const newLevel = restrictionLevels[hotlinkProtection as keyof typeof restrictionLevels] || 0
        hotlinkProtectionChanged = newLevel > currentLevel
      }

      // Check if password attempts changed (only if provided)
      if (passwordAttempts !== undefined) {
        passwordAttemptsChanged = currentSettings.passwordAttempts !== parseInt(passwordAttempts)
      }
    }

    const settings = await prisma.securitySettings.upsert({
      where: { id: 'default' },
      update: {
        hotlinkProtection,
        ipRateLimit: ipRateLimit ? parseInt(ipRateLimit) : 1000,
        sessionRateLimit: sessionRateLimit ? parseInt(sessionRateLimit) : 600,
        passwordAttempts: passwordAttempts ? parseInt(passwordAttempts) : 5,
        sessionTimeoutValue: sessionTimeoutValue ? parseInt(sessionTimeoutValue) : 15,
        sessionTimeoutUnit: sessionTimeoutUnit || 'MINUTES',
        trackAnalytics: trackAnalytics ?? true,
        trackSecurityLogs: trackSecurityLogs ?? true,
        viewSecurityEvents: viewSecurityEvents ?? false,
      },
      create: {
        id: 'default',
        hotlinkProtection,
        ipRateLimit: ipRateLimit ? parseInt(ipRateLimit) : 1000,
        sessionRateLimit: sessionRateLimit ? parseInt(sessionRateLimit) : 600,
        passwordAttempts: passwordAttempts ? parseInt(passwordAttempts) : 5,
        sessionTimeoutValue: sessionTimeoutValue ? parseInt(sessionTimeoutValue) : 15,
        sessionTimeoutUnit: sessionTimeoutUnit || 'MINUTES',
        trackAnalytics: trackAnalytics ?? true,
        trackSecurityLogs: trackSecurityLogs ?? true,
        viewSecurityEvents: viewSecurityEvents ?? false,
      },
    })

    // SECURITY: Invalidate sessions when security settings change
    let invalidationLog: string[] = []

    // 1. Session timeout changed → Invalidate ALL sessions globally
    //    Reason: Existing sessions may exceed new timeout
    if (sessionTimeoutChanged) {
      try {
        const count = await invalidateAllSessions()
        invalidationLog.push(`Invalidated ${count} sessions (timeout changed)`)
        console.log(`[SECURITY] Session timeout changed - invalidated ${count} client sessions`)
      } catch (error) {
        console.error('[SECURITY] Failed to invalidate sessions after timeout change:', error)
        // Don't fail the request if session invalidation fails
      }
    }

    // 2. Hotlink protection became more restrictive → Invalidate ALL sessions
    //    Reason: New security policy should apply immediately
    if (hotlinkProtectionChanged) {
      try {
        const count = await invalidateAllSessions()
        invalidationLog.push(`Invalidated ${count} sessions (hotlink protection strengthened)`)
        console.log(`[SECURITY] Hotlink protection strengthened - invalidated ${count} client sessions`)
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
