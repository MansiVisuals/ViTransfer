/**
 * Generate a secure random password
 * Guarantees: 12 characters minimum, at least one letter, at least one number
 */
export function generateSecurePassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'
  const numbers = '23456789'
  const special = '!@#$%'
  const all = letters + numbers + special

  let password = ''

  // Ensure at least one letter
  password += letters.charAt(Math.floor(Math.random() * letters.length))

  // Ensure at least one number
  password += numbers.charAt(Math.floor(Math.random() * numbers.length))

  // Fill the rest randomly (total 12 chars)
  for (let i = 2; i < 12; i++) {
    password += all.charAt(Math.floor(Math.random() * all.length))
  }

  // Shuffle to randomize positions of guaranteed chars
  password = password.split('').sort(() => Math.random() - 0.5).join('')

  return password
}

/**
 * Generate a URL-safe random slug
 */
export function generateRandomSlug(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let slug = ''
  const length = 8 + Math.floor(Math.random() * 5) // Random length between 8-12
  for (let i = 0; i < length; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length))
    if (i > 0 && i < length - 1 && Math.random() < 0.2) {
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
