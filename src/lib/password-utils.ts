import crypto from 'crypto'

/**
 * Generate a secure random password using crypto.randomInt()
 * Guarantees: 12 characters minimum, at least one letter, at least one number
 */
export function generateSecurePassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'
  const numbers = '23456789'
  const special = '!@#$%'
  const all = letters + numbers + special

  let password = ''

  // Ensure at least one letter
  password += letters.charAt(crypto.randomInt(0, letters.length))

  // Ensure at least one number
  password += numbers.charAt(crypto.randomInt(0, numbers.length))

  // Fill the rest randomly (total 12 chars)
  for (let i = 2; i < 12; i++) {
    password += all.charAt(crypto.randomInt(0, all.length))
  }

  // Shuffle to randomize positions of guaranteed chars using Fisher-Yates
  const chars = password.split('')
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  password = chars.join('')

  return password
}

/**
 * Generate a URL-safe random slug using crypto.randomInt()
 */
export function generateRandomSlug(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let slug = ''
  const length = 8 + crypto.randomInt(0, 5) // Random length between 8-12
  for (let i = 0; i < length; i++) {
    slug += chars.charAt(crypto.randomInt(0, chars.length))
    if (i > 0 && i < length - 1 && crypto.randomInt(0, 5) === 0) {
      slug += '-'
    }
  }
  return slug.replace(/-+/g, '-')
}

/**
 * Sanitize a string to be URL-safe slug
 */
export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
