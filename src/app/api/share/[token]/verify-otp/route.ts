import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyOTP, verifyRecipientEmail } from '@/lib/otp'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'
import { getClientSessionTimeoutSeconds, isHttpsEnabled, getMaxAuthAttempts } from '@/lib/settings'
import { getRedis } from '@/lib/redis'

// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function getIdentifier(request: NextRequest, token: string, email: string): string{
  const ip = getClientIpAddress(request)

  const hash = crypto
    .createHash('sha256')
    .update(`${ip}:${token}:${email}`)
    .digest('hex')
    .slice(0, 16)

  return `ratelimit:share-verify-otp-failed:${token}:${hash}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { email, code } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400 }
      )
    }

    // SECURITY: Validate input lengths to prevent DoS
    if (email.length > 255) {
      return NextResponse.json(
        { error: 'Invalid email' },
        { status: 400 }
      )
    }

    if (code.length > 10) {
      return NextResponse.json(
        { error: 'Invalid code' },
        { status: 400 }
      )
    }

    // Validate code is numeric
    if (!/^\d+$/.test(code.trim())) {
      return NextResponse.json(
        { error: 'Invalid code' },
        { status: 400 }
      )
    }

    // Get max auth attempts from settings
    const MAX_FAILED_ATTEMPTS = await getMaxAuthAttempts()

    // Check rate limiting
    const redisClient = getRedis()
    const rateLimitKey = getIdentifier(request, token, email.toLowerCase().trim())

    // Check if currently locked out from too many failed attempts
    const lockoutData = await redisClient.get(rateLimitKey)
    if (lockoutData) {
      const { count, lockoutUntil } = JSON.parse(lockoutData)
      const now = Date.now()

      if (lockoutUntil && lockoutUntil > now) {
        const retryAfter = Math.ceil((lockoutUntil - now) / 1000)

        // Log security event for rate limit hit
        const ipAddress = getClientIpAddress(request)

        await logSecurityEvent({
          type: 'OTP_RATE_LIMIT_HIT',
          severity: 'WARNING',
          ipAddress,
          details: {
            shareToken: token,
            email,
            failedAttempts: count,
            retryAfter,
          },
          wasBlocked: true,
        })

        return NextResponse.json(
          { error: 'Too many failed attempts. Please try again later.', retryAfter },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
      }
    }

    // Get project
    const project = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
        authMode: true,
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Check if OTP is enabled for this project
    if (project.authMode !== 'OTP' && project.authMode !== 'BOTH') {
      return NextResponse.json(
        { error: 'OTP authentication not enabled for this project' },
        { status: 403 }
      )
    }

    // Verify email is a project recipient
    const isRecipient = await verifyRecipientEmail(email, project.id)
    if (!isRecipient) {
      // SECURITY: Don't reveal if email is valid - return generic error
      // This prevents email enumeration attacks
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 403 }
      )
    }

    // Verify OTP
    const result = await verifyOTP(email, project.id, code)

    if (!result.success) {
      // FAILED attempt - increment rate limit counter
      const now = Date.now()
      const existingData = await redisClient.get(rateLimitKey)

      let count = 1
      let firstAttempt = now

      if (existingData) {
        const parsed = JSON.parse(existingData)
        // Reset if window expired
        if (now - parsed.firstAttempt > RATE_LIMIT_WINDOW_MS) {
          count = 1
          firstAttempt = now
        } else {
          count = parsed.count + 1
          firstAttempt = parsed.firstAttempt
        }
      }

      const rateLimitEntry = {
        count,
        firstAttempt,
        lastAttempt: now,
        lockoutUntil: count >= MAX_FAILED_ATTEMPTS ? now + RATE_LIMIT_WINDOW_MS : undefined
      }

      const ttlSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
      await redisClient.setex(rateLimitKey, ttlSeconds, JSON.stringify(rateLimitEntry))

      // Log security event for failed OTP verification
      const ipAddress = getClientIpAddress(request)
      await logSecurityEvent({
        type: 'OTP_VERIFICATION_FAILED',
        severity: count >= MAX_FAILED_ATTEMPTS ? 'CRITICAL' : 'WARNING',
        projectId: project.id,
        ipAddress,
        details: {
          shareToken: token,
          email,
          error: result.error,
          failedAttempts: count,
          attemptsLeft: result.attemptsLeft,
        },
        wasBlocked: count >= MAX_FAILED_ATTEMPTS,
      })

      // SECURITY: Return same generic error as non-recipient to prevent enumeration
      // Don't reveal specific details like attempts remaining
      return NextResponse.json(
        {
          error: 'Invalid or expired code',
        },
        { status: 403 }
      )
    }

    // SUCCESS - Clear rate limit on successful verification
    await redisClient.del(rateLimitKey)

    // SUCCESS - Create session (same as password flow)
    const redis = getRedis()

    // Get configurable client session timeout and HTTPS setting
    const sessionTimeoutSeconds = await getClientSessionTimeoutSeconds()
    const httpsEnabled = await isHttpsEnabled()

    // Check for existing session or generate new one
    const cookieStore = await cookies()
    let authSessionId = cookieStore.get('share_auth')?.value

    if (!authSessionId) {
      // Generate unique auth session ID (no project ID exposure)
      authSessionId = crypto.randomBytes(16).toString('base64url')

      // Set generic authentication cookie (no project ID exposure)
      cookieStore.set('share_auth', authSessionId, {
        httpOnly: true,
        secure: httpsEnabled,
        sameSite: 'strict',
        path: '/',
        maxAge: sessionTimeoutSeconds,
      })
    }

    // Add project to session's authorized projects set
    await redis.sadd(`auth_projects:${authSessionId}`, project.id)
    // Refresh TTL on the entire set
    await redis.expire(`auth_projects:${authSessionId}`, sessionTimeoutSeconds)

    // Log security event for successful OTP verification
    const ipAddress = getClientIpAddress(request)
    await logSecurityEvent({
      type: 'OTP_VERIFICATION_SUCCESS',
      severity: 'INFO',
      projectId: project.id,
      ipAddress,
      details: {
        shareToken: token,
        email,
      },
      wasBlocked: false,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error verifying OTP:', error)
    return NextResponse.json(
      { error: 'Failed to verify code' },
      { status: 500 }
    )
  }
}
