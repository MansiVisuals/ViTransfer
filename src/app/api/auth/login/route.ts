import { NextRequest, NextResponse } from 'next/server'
import { verifyCredentials, createSession } from '@/lib/auth'
import { checkRateLimit, incrementRateLimit, clearRateLimit } from '@/lib/rate-limit'
import { validateRequest, loginSchema } from '@/lib/validation'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { getRedis } from '@/lib/redis'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * Secure Login Endpoint
 * 
 * POST /api/auth/login
 * 
 * Security Features:
 * 1. Rate limiting on FAILED attempts only (6 failed attempts in 15 minutes)
 * 2. Successful logins clear the rate limit counter
 * 3. Input validation using Zod schema
 * 4. Secure password verification with bcrypt
 * 5. JWT tokens with short TTL (15 min access, 7 day refresh)
 * 6. HttpOnly, Secure, SameSite cookies
 * 
 * Rate Limiting Strategy:
 * - Only failed login attempts increment the counter
 * - Successful login clears the counter
 * - Prevents brute force attacks without blocking legitimate users
 * - 6 attempts allows for typos while preventing automated attacks
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input first to get the email/username
    const validation = validateRequest(loginSchema, body)
    if (!validation.success) {
      // Don't count validation errors as failed login attempts
      // This prevents attackers from triggering rate limit with invalid input
      return NextResponse.json(
        { error: validation.error, details: validation.details },
        { status: 400 }
      )
    }
    
    const { email, password } = validation.data

    // Check rate limit TIED TO THE USERNAME/EMAIL being attempted
    // This prevents brute-force attacks via browser rotation
    const rateLimitCheck = await checkRateLimit(request, 'login', email)
    if (rateLimitCheck.limited) {
      return NextResponse.json(
        { 
          error: 'Too many failed login attempts for this account. Please try again later.',
          retryAfter: rateLimitCheck.retryAfter 
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitCheck.retryAfter || 900)
          }
        }
      )
    }

    // Verify credentials (supports both username and email)
    const user = await verifyCredentials(email, password)

    if (!user) {
      // FAILED LOGIN: Increment rate limit counter FOR THIS SPECIFIC USERNAME/EMAIL
      // This prevents attackers from bypassing via browser rotation
      await incrementRateLimit(request, 'login', email)

      return NextResponse.json(
        { error: 'Invalid username/email or password' },
        { status: 401 }
      )
    }

    // SUCCESSFUL LOGIN: Clear rate limit counter for this username/email
    // User successfully authenticated, reset failed attempt counter
    await clearRateLimit(request, 'login', email)

    // Create session with JWT tokens
    await createSession(user)

    // SECURITY: Store fingerprint for refresh token
    const cookieStore = await cookies()
    const refreshTokenCookie = cookieStore.get('vitransfer_refresh')
    if (refreshTokenCookie?.value) {
      const userAgent = request.headers.get('user-agent') || 'unknown'
      const fingerprintHash = crypto
        .createHash('sha256')
        .update(userAgent)
        .digest('base64url')

      await storeTokenFingerprint(user.id, refreshTokenCookie.value, fingerprintHash)
    }

    // Return user data (without password)
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    )
  }
}

/**
 * Store token fingerprint in Redis for theft detection
 */
async function storeTokenFingerprint(
  userId: string,
  refreshToken: string,
  fingerprintHash: string
): Promise<void> {
  try {
    const redis = getRedis()

    // Use full hash (256 bits) - no truncation for better collision resistance
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('base64url')

    const key = `token_fingerprint:${userId}:${tokenHash}`
    const ttl = 7 * 24 * 60 * 60 // 7 days

    await redis.setex(key, ttl, fingerprintHash)
  } catch (error) {
    console.error('[AUTH] Failed to store token fingerprint:', error)
    // Don't fail login if fingerprint storage fails
  }
}
