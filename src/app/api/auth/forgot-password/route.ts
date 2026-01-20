import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { generatePasswordResetToken, buildPasswordResetUrl } from '@/lib/password-reset'
import { sendPasswordResetEmail } from '@/lib/email'
import { logSecurityEvent } from '@/lib/video-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Request Password Reset
 * 
 * POST /api/auth/forgot-password
 * 
 * SECURITY:
 * - Rate limited to prevent abuse
 * - Always returns success (prevents email enumeration)
 * - Logs security events
 * - Token expires in 30 minutes
 * - Silently handles missing SMTP configuration (no information leak)
 */
export async function POST(request: NextRequest) {
  // Strict rate limiting: 3 requests per 15 minutes
  const rateLimitResult = await rateLimit(request, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 3,
    message: 'Too many password reset requests. Please try again later.',
  }, 'forgot-password')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email.trim() : ''

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      success: true,
      message: 'If an account exists with this email, you will receive password reset instructions.',
    })

    if (!email || email.length === 0) {
      return successResponse
    }

    // Find user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          { username: { equals: email, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    })

    if (!user) {
      // Log failed attempt (potential attack)
      await logSecurityEvent({
        type: 'ADMIN_PASSWORD_RESET_UNKNOWN_EMAIL',
        severity: 'INFO',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        details: {
          email,
        },
      })
      return successResponse
    }

    // Check SMTP configuration (silently fail if not configured)
    const settings = await prisma.settings.findFirst()
    const smtpConfigured = !!(
      settings?.smtpServer &&
      settings?.smtpPort &&
      settings?.smtpFromAddress
    )

    // Generate secure reset token
    const token = generatePasswordResetToken({
      userId: user.id,
      userEmail: user.email,
      expiresInMinutes: 30,
    })

    // Build reset URL
    const appUrl = `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host')}`
    const resetUrl = buildPasswordResetUrl(appUrl, token)

    // Send email (only if SMTP is configured, but always return success)
    if (smtpConfigured) {
      try {
        await sendPasswordResetEmail({
          adminEmail: user.email,
          adminName: user.name || 'Admin',
          resetUrl,
        })

        // Log successful email sent
        await logSecurityEvent({
          type: 'ADMIN_PASSWORD_RESET_EMAIL_SENT',
          severity: 'INFO',
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
          details: {
            userId: user.id,
            email: user.email,
          },
        })
      } catch (emailError) {
        console.error('[PASSWORD_RESET] Email send error for user:', user.email, emailError)
        // Log email failure
        await logSecurityEvent({
          type: 'ADMIN_PASSWORD_RESET_EMAIL_FAILED',
          severity: 'WARNING',
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
          details: {
            userId: user.id,
            email: user.email,
            error: emailError instanceof Error ? emailError.message : 'Unknown error',
          },
        })
        // Still return success to prevent info leak
      }
    } else {
      // SMTP not configured - log for admin awareness but still return success
      console.warn('[PASSWORD_RESET] SMTP not configured, reset token generated but email not sent for user:', user.email)
      await logSecurityEvent({
        type: 'ADMIN_PASSWORD_RESET_EMAIL_FAILED',
        severity: 'WARNING',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        details: {
          userId: user.id,
          email: user.email,
          reason: 'SMTP not configured',
        },
      })
    }

    return successResponse
  } catch (error) {
    console.error('[PASSWORD_RESET] Error:', error)
    // Return success even on error to prevent info leak
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, you will receive password reset instructions.',
    })
  }
}
