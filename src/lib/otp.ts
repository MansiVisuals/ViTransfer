import crypto from 'crypto'
import { prisma } from './db'
import { sendEmail, escapeHtml } from './email'
import { getRedis } from './video-access'

// OTP Configuration
const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 10
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const ACCOUNT_LOCKOUT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

// NOTE: OTP_MAX_ATTEMPTS and MAX_OTP_REQUESTS now use global SecuritySettings.passwordAttempts
// This ensures consistent lockout behavior across password and OTP authentication

/**
 * Get max password attempts from security settings
 * Uses global SecuritySettings.passwordAttempts for consistent lockout behavior
 */
async function getMaxPasswordAttempts(): Promise<number> {
  const securitySettings = await prisma.securitySettings.findUnique({
    where: { id: 'default' },
    select: { passwordAttempts: true },
  })
  return securitySettings?.passwordAttempts || 5 // Default to 5 if not set
}

/**
 * Hash email for Redis key (no PII exposure in keys)
 */
function hashEmail(email: string): string {
  return crypto
    .createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex')
    .slice(0, 16)
}

/**
 * Generate a secure 6-digit OTP code
 */
export function generateOTP(): string {
  // Use crypto.randomInt for cryptographically secure random numbers
  const min = Math.pow(10, OTP_LENGTH - 1)
  const max = Math.pow(10, OTP_LENGTH) - 1
  return crypto.randomInt(min, max + 1).toString()
}

/**
 * Verify that email belongs to project recipients
 */
export async function verifyRecipientEmail(
  email: string,
  projectId: string
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim()

  const recipient = await prisma.projectRecipient.findFirst({
    where: {
      projectId,
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
    },
  })

  return !!recipient
}

/**
 * Check rate limit for OTP requests
 * Uses global SecuritySettings.passwordAttempts for max attempts
 */
export async function checkOTPRateLimit(
  email: string,
  projectId: string
): Promise<{ limited: boolean; retryAfter?: number }> {
  const redis = getRedis()
  const emailHash = hashEmail(email)
  const rateLimitKey = `otp:ratelimit:${projectId}:${emailHash}`

  // Get max attempts from security settings
  const maxOtpRequests = await getMaxPasswordAttempts()

  const data = await redis.get(rateLimitKey)
  const now = Date.now()

  if (data) {
    const { count, firstAttempt } = JSON.parse(data)

    // Check if window has expired
    if (now - firstAttempt > RATE_LIMIT_WINDOW_MS) {
      // Window expired, reset
      await redis.del(rateLimitKey)
      return { limited: false }
    }

    // Check if limit exceeded
    if (count >= maxOtpRequests) {
      const retryAfter = Math.ceil(
        (firstAttempt + RATE_LIMIT_WINDOW_MS - now) / 1000
      )
      return { limited: true, retryAfter }
    }
  }

  return { limited: false }
}

/**
 * Increment OTP request rate limit counter
 */
async function incrementOTPRateLimit(
  email: string,
  projectId: string
): Promise<void> {
  const redis = getRedis()
  const emailHash = hashEmail(email)
  const rateLimitKey = `otp:ratelimit:${projectId}:${emailHash}`

  const data = await redis.get(rateLimitKey)
  const now = Date.now()

  let count = 1
  let firstAttempt = now

  if (data) {
    const parsed = JSON.parse(data)
    // Reset if window expired
    if (now - parsed.firstAttempt > RATE_LIMIT_WINDOW_MS) {
      count = 1
      firstAttempt = now
    } else {
      count = parsed.count + 1
      firstAttempt = parsed.firstAttempt
    }
  }

  const ttlSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
  await redis.setex(
    rateLimitKey,
    ttlSeconds,
    JSON.stringify({ count, firstAttempt })
  )
}

/**
 * Store OTP in Redis
 */
export async function storeOTP(
  email: string,
  projectId: string,
  code: string
): Promise<void> {
  const redis = getRedis()
  const emailHash = hashEmail(email)
  const otpKey = `otp:${projectId}:${emailHash}`

  const otpData = {
    code,
    email: email.toLowerCase().trim(),
    attempts: 0,
    createdAt: Date.now(),
  }

  const ttlSeconds = OTP_EXPIRY_MINUTES * 60
  await redis.setex(otpKey, ttlSeconds, JSON.stringify(otpData))

  // Increment rate limit counter
  await incrementOTPRateLimit(email, projectId)
}

/**
 * Send OTP email to recipient
 */
export async function sendOTPEmail(
  email: string,
  projectTitle: string,
  code: string
): Promise<void> {
  // SECURITY: Escape HTML to prevent XSS
  const safeProjectTitle = escapeHtml(projectTitle)
  const subject = `Your verification code for ${safeProjectTitle}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333; margin-bottom: 20px;">Verification Code</h2>

      <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 30px;">
        Your verification code for <strong>${safeProjectTitle}</strong> is:
      </p>

      <div style="background: #f5f5f5; border-radius: 8px; padding: 30px; text-align: center; margin-bottom: 30px;">
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #000;">
          ${code}
        </div>
      </div>

      <p style="color: #666; font-size: 14px; line-height: 1.5; margin-bottom: 10px;">
        This code will expire in ${OTP_EXPIRY_MINUTES} minutes.
      </p>

      <p style="color: #999; font-size: 13px; line-height: 1.5;">
        If you didn't request this code, please ignore this email.
      </p>
    </div>
  `

  const text = `
Your verification code for ${projectTitle} is:

${code}

This code will expire in ${OTP_EXPIRY_MINUTES} minutes.

If you didn't request this code, please ignore this email.
  `.trim()

  await sendEmail({
    to: email,
    subject,
    html,
    text,
  })
}

/**
 * Verify OTP code
 * Returns { success: true } or { success: false, error: string, attemptsLeft?: number }
 * Uses global SecuritySettings.passwordAttempts for max attempts
 */
export async function verifyOTP(
  email: string,
  projectId: string,
  code: string
): Promise<{
  success: boolean
  error?: string
  attemptsLeft?: number
}> {
  const redis = getRedis()
  const emailHash = hashEmail(email)
  const otpKey = `otp:${projectId}:${emailHash}`

  // Get max attempts from security settings
  const maxAttempts = await getMaxPasswordAttempts()

  const data = await redis.get(otpKey)

  if (!data) {
    return {
      success: false,
      error: 'Invalid or expired code',
    }
  }

  const otpData = JSON.parse(data)

  // Check if email matches (case-insensitive)
  if (otpData.email.toLowerCase() !== email.toLowerCase().trim()) {
    return {
      success: false,
      error: 'Invalid code',
    }
  }

  // Check if too many attempts
  if (otpData.attempts >= maxAttempts) {
    await redis.del(otpKey)
    return {
      success: false,
      error: 'Too many incorrect attempts. Please request a new code.',
    }
  }

  // Verify code using constant-time comparison
  const isValid = constantTimeCompare(code.trim(), otpData.code)

  if (!isValid) {
    // Increment attempts
    otpData.attempts += 1
    const attemptsLeft = maxAttempts - otpData.attempts

    if (attemptsLeft > 0) {
      // Update stored data with incremented attempts
      const ttl = await redis.ttl(otpKey)
      await redis.setex(otpKey, ttl > 0 ? ttl : 60, JSON.stringify(otpData))

      return {
        success: false,
        error: 'Incorrect code',
        attemptsLeft,
      }
    } else {
      // Max attempts reached, delete OTP
      await redis.del(otpKey)
      return {
        success: false,
        error: 'Too many incorrect attempts. Please request a new code.',
      }
    }
  }

  // Success - delete OTP (one-time use)
  await redis.del(otpKey)

  return { success: true }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')

  // If lengths differ, still compare dummy buffers to maintain constant time
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32))
    return false
  }

  return crypto.timingSafeEqual(bufA, bufB)
}
