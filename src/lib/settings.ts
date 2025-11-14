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
 * Check if auto-approve project when all videos approved is enabled
 * Returns true as default if not set
 */
export async function getAutoApproveProject(): Promise<boolean> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { autoApproveProject: true },
    })

    return settings?.autoApproveProject ?? true
  } catch (error) {
    console.error('Error fetching auto-approve setting:', error)
    return true // Default to enabled on error
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

/**
 * Check if HTTPS enforcement is enabled
 *
 * Priority: Environment variable (HTTPS_ENABLED) > Database setting > Default (true)
 *
 * IMPORTANT: Environment variable ALWAYS takes precedence - this is the escape hatch!
 * If you get locked out on localhost, set HTTPS_ENABLED=false in docker-compose.yml
 *
 * When HTTPS is OFF:
 * - Cookies use secure: false
 * - No HSTS header
 * - Use for: localhost, internal LAN (set HTTPS_ENABLED=false in docker-compose)
 *
 * When HTTPS is ON (default for security):
 * - Cookies use secure: true (only sent over HTTPS)
 * - HSTS header enabled (forces browser to use HTTPS)
 * - Use for: production deployments with HTTPS (direct or reverse proxy)
 */
/**
 * Initialize security settings from environment variables on container startup
 * This should be called once when the application starts
 */
export async function initializeSecuritySettings() {
  try {
    const envValue = process.env.HTTPS_ENABLED

    if (envValue !== undefined) {
      const httpsEnabled = envValue === 'true' || envValue === '1'

      // Update database with environment variable value
      await prisma.securitySettings.upsert({
        where: { id: 'default' },
        update: { httpsEnabled },
        create: { id: 'default', httpsEnabled },
      })

      console.log(`[INIT] HTTPS_ENABLED environment variable detected. Set database value to: ${httpsEnabled}`)
    }
  } catch (error) {
    console.error('[INIT] Error initializing security settings from environment:', error)
  }
}

export async function isHttpsEnabled(): Promise<boolean> {
  try {
    // Read from database (env var is synced to DB on startup via initializeSecuritySettings)
    const settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: { httpsEnabled: true },
    })

    // Default to true for production security
    return settings?.httpsEnabled ?? true
  } catch (error) {
    console.error('Error checking HTTPS enabled status:', error)
    // Default to true even on error for security
    return true
  }
}

