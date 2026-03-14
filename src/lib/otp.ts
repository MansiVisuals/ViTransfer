import crypto from 'crypto'
import { prisma } from './db'
import { renderUnsubscribeSection, sendEmail, getEmailSettings, renderEmailShell, getEmailBrand, processTemplateContent } from './email'
import { getRedis } from './redis'
import { loadLocaleMessages } from '@/i18n/locale'
import { getEmailTemplate, replacePlaceholders } from './email-template-system'

// OTP Configuration
const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 10
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

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
    let parsed
    try {
      parsed = JSON.parse(data)
    } catch (error) {
      console.error('Failed to parse OTP rate limit data:', error)
      await redis.del(rateLimitKey)
      return { limited: false }
    }
    const { count, firstAttempt } = parsed

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
    try {
      const parsed = JSON.parse(data)
      // Reset if window expired
      if (now - parsed.firstAttempt > RATE_LIMIT_WINDOW_MS) {
        count = 1
        firstAttempt = now
      } else {
        count = parsed.count + 1
        firstAttempt = parsed.firstAttempt
      }
    } catch (error) {
      console.error('Failed to parse OTP rate limit data:', error)
      await redis.del(rateLimitKey)
      // Continue with default values
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
  code: string,
  unsubscribeUrl?: string,
  locale: string = 'en'
): Promise<void> {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'
  const brand = getEmailBrand(settings.accentColor)
  const messages = await loadLocaleMessages(locale)
  const otpMessages = messages?.shareOtpEmail || {}

  const template = await getEmailTemplate('OTP_VERIFICATION', locale)
  const unsubscribeSection = unsubscribeUrl ? renderUnsubscribeSection(unsubscribeUrl, brand, messages?.email) : ''

  const placeholderValues: Record<string, string> = {
    '{{RECIPIENT_NAME}}': 'there',
    '{{PROJECT_TITLE}}': projectTitle,
    '{{OTP_CODE}}': code,
    '{{EXPIRY_MINUTES}}': String(OTP_EXPIRY_MINUTES),
    '{{UNSUBSCRIBE_SECTION}}': unsubscribeSection,
    '{{COMPANY_NAME}}': companyName,
  }

  const subject = replacePlaceholders(template.subject, placeholderValues)
  const bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand)

  const title = otpMessages.title || 'Verification Code'
  const preheader = (otpMessages.preheader || 'Your verification code for {projectTitle}')
    .replace('{projectTitle}', projectTitle)
  const expiry = (otpMessages.expiry || 'This code will expire in {minutes} minutes.')
    .replace('{minutes}', String(OTP_EXPIRY_MINUTES))
  const textSubject = (otpMessages.subject || 'Your verification code for {projectTitle}')
    .replace('{projectTitle}', projectTitle)
  const textIgnoreNotice = otpMessages.textIgnoreNotice || "If you didn't request this code, you can safely ignore this email."
  const textIntro = (otpMessages.textIntro || 'Your verification code for {projectTitle} is:')
    .replace('{projectTitle}', projectTitle)

  const html = renderEmailShell({
    companyName,
    title,
    preheader,
    brand,
    bodyContent,
  })

  const text = `
${textSubject}

${textIntro}

${code}

${expiry}

${textIgnoreNotice}
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

  let otpData
  try {
    otpData = JSON.parse(data)
  } catch (error) {
    console.error('Failed to parse OTP data:', error)
    await redis.del(otpKey)
    return {
      success: false,
      error: 'Invalid or expired code',
    }
  }

  if (otpData.email.toLowerCase() !== email.toLowerCase().trim()) {
    return {
      success: false,
      error: 'Invalid or expired code',
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
