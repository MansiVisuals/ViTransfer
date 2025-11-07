import { prisma } from './db'

/**
 * Get the company name from settings
 * Returns 'Studio' as default if not set
 */
export async function getCompanyName(): Promise<string> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { companyName: true },
    })

    return settings?.companyName || 'Studio'
  } catch (error) {
    console.error('Error fetching company name:', error)
    return 'Studio' // Fallback to default
  }
}

/**
 * Get all settings
 */
export async function getSettings() {
  try {
    let settings = await prisma.settings.findUnique({
      where: { id: 'default' },
    })

    if (!settings) {
      // Create default settings if they don't exist
      settings = await prisma.settings.create({
        data: {
          id: 'default',
          companyName: 'Studio',
        },
      })
    }

    return settings
  } catch (error) {
    console.error('Error fetching settings:', error)
    return null
  }
}

/**
 * Check if SMTP is configured
 */
export async function isSmtpConfigured(): Promise<boolean> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        smtpServer: true,
        smtpPort: true,
        smtpUsername: true,
        smtpPassword: true,
      },
    })

    return !!(settings?.smtpServer && settings?.smtpPort && settings?.smtpUsername && settings?.smtpPassword)
  } catch (error) {
    console.error('Error checking SMTP configuration:', error)
    return false
  }
}

/**
 * Get client session timeout in seconds from security settings
 * Used for:
 * - Client share sessions (share_session, share_auth cookies)
 * - Video access tokens
 * - Redis session mappings
 *
 * NOT used for admin JWT sessions (those stay fixed at 15 min with auto-refresh)
 */
export async function getClientSessionTimeoutSeconds(): Promise<number> {
  try {
    const settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: {
        sessionTimeoutValue: true,
        sessionTimeoutUnit: true,
      },
    })

    if (!settings) {
      // Default to 15 minutes if settings don't exist
      return 15 * 60
    }

    const value = settings.sessionTimeoutValue
    const unit = settings.sessionTimeoutUnit

    // Convert to seconds based on unit
    switch (unit) {
      case 'MINUTES':
        return value * 60
      case 'HOURS':
        return value * 60 * 60
      case 'DAYS':
        return value * 24 * 60 * 60
      case 'WEEKS':
        return value * 7 * 24 * 60 * 60
      default:
        // Fallback to 15 minutes if unit is invalid
        return 15 * 60
    }
  } catch (error) {
    console.error('Error fetching client session timeout:', error)
    // Fallback to 15 minutes on error
    return 15 * 60
  }
}

