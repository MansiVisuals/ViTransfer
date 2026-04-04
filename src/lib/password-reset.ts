import { decrypt, encrypt } from './encryption'

type PasswordResetPayloadV1 = {
  v: 1
  t: 'password_reset'
  uid: string
  em: string
  exp: number
}

/**
 * Generate a secure password reset token
 * 
 * @param input - User ID and email
 * @returns Encrypted token string
 */
export function generatePasswordResetToken(input: {
  userId: string
  userEmail: string
  expiresInMinutes?: number
}): string {
  const expiresInMinutes = input.expiresInMinutes ?? 30 // 30 minutes default
  const exp = Date.now() + expiresInMinutes * 60 * 1000

  const payload: PasswordResetPayloadV1 = {
    v: 1,
    t: 'password_reset',
    uid: input.userId,
    em: input.userEmail.toLowerCase().trim(),
    exp,
  }

  return encrypt(JSON.stringify(payload))
}

/**
 * Verify and decode a password reset token
 *
 * @param token - Encrypted token string
 * @returns Decoded payload or null if invalid/expired
 */
export function verifyPasswordResetToken(token: string): {
  userId: string
  userEmail: string
} | null {
  const result = verifyPasswordResetTokenWithReason(token)
  return result.valid ? result.payload : null
}

/**
 * Verify a password reset token and return the failure reason.
 * Used by the reset-password route to distinguish expired vs invalid tokens.
 */
export function verifyPasswordResetTokenWithReason(token: string): {
  valid: true
  payload: { userId: string; userEmail: string }
} | {
  valid: false
  reason: 'invalid' | 'expired'
} {
  try {
    const decoded = decrypt(token)
    const payload = JSON.parse(decoded) as Partial<PasswordResetPayloadV1>

    // Validate structure
    if (payload.v !== 1 || payload.t !== 'password_reset') return { valid: false, reason: 'invalid' }
    if (typeof payload.uid !== 'string' || payload.uid.length === 0) return { valid: false, reason: 'invalid' }
    if (typeof payload.em !== 'string' || payload.em.length === 0) return { valid: false, reason: 'invalid' }
    if (typeof payload.exp !== 'number') return { valid: false, reason: 'invalid' }

    // Check expiration
    if (Date.now() > payload.exp) return { valid: false, reason: 'expired' }

    return {
      valid: true,
      payload: {
        userId: payload.uid,
        userEmail: payload.em,
      },
    }
  } catch {
    return { valid: false, reason: 'invalid' }
  }
}

/**
 * Build password reset URL
 * 
 * @param appUrl - Application base URL
 * @param token - Reset token
 * @returns Full reset URL
 */
export function buildPasswordResetUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, '')
  return `${base}/reset-password#token=${encodeURIComponent(token)}`
}
