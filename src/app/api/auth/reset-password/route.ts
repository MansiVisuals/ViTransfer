import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { verifyPasswordResetToken } from '@/lib/password-reset'
import { hashPassword, validatePassword } from '@/lib/encryption'
import { invalidateAdminSessions } from '@/lib/session-invalidation'
import { logSecurityEvent } from '@/lib/video-access'
import { getRedis } from '@/lib/redis'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reset Password
 * 
 * POST /api/auth/reset-password
 * 
 * SECURITY:
 * - Rate limited
 * - Token verification (encrypted, time-limited)
 * - Single-use tokens (Redis tracking)
 * - Password validation
 * - Invalidates all existing sessions
 * - Logs security event
 */
export async function POST(request: NextRequest) {
  // Rate limiting: 5 requests per 15 minutes
  const rateLimitResult = await rateLimit(request, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: 'Too many password reset attempts. Please try again later.',
  }, 'reset-password')

  if (rateLimitResult) {
    // Log rate limit hit
    await logSecurityEvent({
      type: 'ADMIN_PASSWORD_RESET_RATE_LIMIT_HIT',
      severity: 'WARNING',
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      details: {
        reason: 'Too many password reset attempts',
      },
    })
    return rateLimitResult
  }

  try {
    const body = await request.json().catch(() => ({}))
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const newPassword = typeof body?.password === 'string' ? body.password : ''

    if (!token || token.length === 0) {
      return NextResponse.json(
        { error: 'Reset token is required' },
        { status: 400 }
      )
    }

    if (!newPassword || newPassword.length === 0) {
      return NextResponse.json(
        { error: 'New password is required' },
        { status: 400 }
      )
    }

    // Validate password strength
    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: passwordValidation.errors[0] || 'Invalid password' },
        { status: 400 }
      )
    }

    // Verify and decode token
    const payload = verifyPasswordResetToken(token)
    if (!payload) {
      // Log invalid token attempt
      await logSecurityEvent({
        type: 'ADMIN_PASSWORD_RESET_TOKEN_INVALID',
        severity: 'WARNING',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        details: {
          reason: 'Invalid or expired token',
        },
      })
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      )
    }

    // Check if token has already been used (single-use enforcement)
    const redis = getRedis()
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const tokenKey = `password_reset_used:${tokenHash}`
    
    const tokenUsed = await redis.get(tokenKey)
    if (tokenUsed) {
      // Log attempt to reuse token
      await logSecurityEvent({
        type: 'ADMIN_PASSWORD_RESET_TOKEN_INVALID',
        severity: 'WARNING',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        details: {
          reason: 'Token already used',
          userId: payload.userId,
        },
      })
      return NextResponse.json(
        { error: 'This reset link has already been used. Please request a new one.' },
        { status: 400 }
      )
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Verify email matches (extra security)
    if (user.email.toLowerCase() !== payload.userEmail.toLowerCase()) {
      // Log token mismatch (security concern)
      await logSecurityEvent({
        type: 'ADMIN_PASSWORD_RESET_TOKEN_INVALID',
        severity: 'WARNING',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        details: {
          reason: 'Token email mismatch',
          userId: user.id,
        },
      })
      return NextResponse.json(
        { error: 'Invalid reset token' },
        { status: 400 }
      )
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword)

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    })

    // Mark token as used (30 minutes TTL to match token expiration)
    // This prevents the same token from being used multiple times
    await redis.set(tokenKey, '1', 'EX', 30 * 60)

    // Invalidate all sessions for this user (security: force re-login everywhere)
    await invalidateAdminSessions(user.id)

    // Log security event (includes email for server-side audit trail)
    await logSecurityEvent({
      type: 'ADMIN_PASSWORD_RESET_COMPLETED',
      severity: 'INFO',
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      details: {
        userId: user.id,
        email: user.email,
      },
    })

    console.log('[PASSWORD_RESET] Password successfully reset for user:', user.email)

    // Return generic success message (no user-specific information)
    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully',
    })
  } catch (error) {
    console.error('[PASSWORD_RESET] Error:', error)
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    )
  }
}
