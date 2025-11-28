import { NextRequest, NextResponse } from 'next/server'
import { verifyCredentials, issueAdminTokens } from '@/lib/auth'
import { checkRateLimit, incrementRateLimit, clearRateLimit } from '@/lib/rate-limit'
import { validateRequest, loginSchema } from '@/lib/validation'
import crypto from 'crypto'
export const runtime = 'nodejs'




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
 * 5. JWT tokens with short TTL (15 min access, 7 day refresh) returned explicitly in JSON
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

    const fingerprint = fingerprintHash(request.headers.get('user-agent') || 'unknown')
    const tokens = await issueAdminTokens(user, fingerprint)

    // Return user data (without password)
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
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
function fingerprintHash(userAgent: string): string {
  return crypto.createHash('sha256').update(userAgent).digest('base64url')
}
