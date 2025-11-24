import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import crypto from 'crypto'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'
import { getMaxAuthAttempts } from '@/lib/settings'
import { getRedis } from '@/lib/redis'
import { signShareToken } from '@/lib/auth'
export const runtime = 'nodejs'




// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 */
function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')

  // If lengths differ, still compare dummy buffers to maintain constant time
  if (bufA.length !== bufB.length) {
    // Compare two equal-length dummy buffers to maintain timing
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32))
    return false
  }

  return crypto.timingSafeEqual(bufA, bufB)
}

function getIdentifier(request: NextRequest, token: string): string {
  const ip = getClientIpAddress(request)
  
  const hash = crypto
    .createHash('sha256')
    .update(`${ip}:${token}`)
    .digest('hex')
    .slice(0, 16)
  
  return `ratelimit:share-verify-failed:${token}:${hash}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const redis = getRedis()
    const rateLimitKey = getIdentifier(request, token)

    // Get max auth attempts from settings
    const MAX_FAILED_ATTEMPTS = await getMaxAuthAttempts()

    // Check if currently locked out from too many failed attempts
    const lockoutData = await redis.get(rateLimitKey)
    if (lockoutData) {
      const { count, lockoutUntil } = JSON.parse(lockoutData)
      const now = Date.now()

      if (lockoutUntil && lockoutUntil > now) {
        const retryAfter = Math.ceil((lockoutUntil - now) / 1000)

        // Log security event for rate limit hit
        const ipAddress = getClientIpAddress(request)

        await logSecurityEvent({
          type: 'PASSWORD_RATE_LIMIT_HIT',
          severity: 'WARNING',
          ipAddress,
          details: {
            shareToken: token,
            failedAttempts: count,
            retryAfter,
          },
          wasBlocked: true,
        })

        return NextResponse.json(
          { error: 'Too many failed password attempts. Please try again later.', retryAfter },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
      }
    }
    
    const body = await request.json()
    const { password } = body

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    const project = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
        sharePassword: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (!project.sharePassword) {
      return NextResponse.json({ success: true })
    }

    // Decrypt the stored password and compare with provided password using constant-time comparison
    let isValid = false
    try {
      const decryptedPassword = decrypt(project.sharePassword)
      // Use constant-time comparison to prevent timing attacks
      isValid = constantTimeCompare(password, decryptedPassword)
    } catch (error) {
      console.error('Error decrypting password:', error)
      // If decryption fails, password is invalid
      isValid = false
    }

    if (!isValid) {
      // FAILED attempt - increment rate limit counter
      const now = Date.now()
      const existingData = await redis.get(rateLimitKey)

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
      await redis.setex(rateLimitKey, ttlSeconds, JSON.stringify(rateLimitEntry))

      // Log security event for failed password attempt
      const ipAddress = getClientIpAddress(request)

      await logSecurityEvent({
        type: 'FAILED_PASSWORD_ATTEMPT',
        severity: count >= MAX_FAILED_ATTEMPTS ? 'CRITICAL' : 'WARNING',
        projectId: project.id,
        ipAddress,
        details: {
          shareToken: token,
          attemptNumber: count,
          maxAttempts: MAX_FAILED_ATTEMPTS,
        },
        wasBlocked: false,
      })

      // If this was the 5th failed attempt, return rate limit error
      if (count >= MAX_FAILED_ATTEMPTS) {
        const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)

        // Log additional event for lockout
        await logSecurityEvent({
          type: 'PASSWORD_LOCKOUT',
          severity: 'CRITICAL',
          projectId: project.id,
          ipAddress,
          details: {
            shareToken: token,
            failedAttempts: count,
            lockoutDuration: retryAfter,
          },
          wasBlocked: true,
        })

        return NextResponse.json(
          { error: 'Too many failed password attempts. Please try again later.', retryAfter },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
      }

      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // SUCCESS - clear any existing rate limit data
    await redis.del(rateLimitKey)

    const shareToken = signShareToken({
      shareId: token,
      projectId: project.id,
      permissions: ['view', 'comment', 'download'],
      guest: false,
    })

    return NextResponse.json({ success: true, shareToken })
  } catch (error) {
    console.error('Error verifying share password:', error)
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }
}
