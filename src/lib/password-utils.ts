/**
 * Cryptographically secure random integer for browser and server.
 * Uses Web Crypto API (works in both environments).
 */
function getSecureRandomInt(max: number): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0] % max
}

/**
 * Generate a secure random password using Web Crypto API.
 * Works in both browser ('use client') and server contexts.
 * Guarantees: 12 characters, at least one letter, one number, one special char.
 */
export function generateSecurePassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'
  const numbers = '23456789'
  const special = '!@#$%'
  const all = letters + numbers + special

  let password = ''

  // Ensure at least one letter
  password += letters.charAt(getSecureRandomInt(letters.length))

  // Ensure at least one number
  password += numbers.charAt(getSecureRandomInt(numbers.length))

  // Fill the rest randomly (total 12 chars)
  for (let i = 2; i < 12; i++) {
    password += all.charAt(getSecureRandomInt(all.length))
  }

  // Shuffle to randomize positions of guaranteed chars using Fisher-Yates
  const chars = password.split('')
  for (let i = chars.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}

/**
 * Generate a URL-safe random slug
 */
export function generateRandomSlug(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let slug = ''
  const length = 8 + getSecureRandomInt(5) // Random length between 8-12
  for (let i = 0; i < length; i++) {
    slug += chars.charAt(getSecureRandomInt(chars.length))
    if (i > 0 && i < length - 1 && getSecureRandomInt(5) === 0) {
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
