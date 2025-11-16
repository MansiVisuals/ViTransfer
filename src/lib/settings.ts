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

export async function getMaxAuthAttempts(): Promise<number> {
  try {
    const securitySettings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: { passwordAttempts: true }
    })
    return securitySettings?.passwordAttempts || 5
  } catch (error) {
    return 5 // Default fallback
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

/**
 * Get WebAuthn Relying Party configuration from settings
 *
 * SECURITY: Throws error if appDomain is not configured
 * PassKey authentication REQUIRES proper domain configuration
 *
 * @returns RP_ID and origin(s) for WebAuthn operations
 */
export async function getWebAuthnConfig(): Promise<{
  rpID: string
  rpName: string
  origins: string[]
}> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        appDomain: true,
        companyName: true,
      },
    })

    if (!settings?.appDomain) {
      throw new Error(
        'PASSKEY_CONFIG_ERROR: Application Domain must be configured in Settings before using PassKey authentication. ' +
        'Go to Admin Settings and configure your domain (e.g., https://yourdomain.com)'
      )
    }

    // Parse and validate domain
    let url: URL
    try {
      url = new URL(settings.appDomain)
    } catch {
      throw new Error(
        `PASSKEY_CONFIG_ERROR: Invalid appDomain format: "${settings.appDomain}". ` +
        'Must be a valid URL (e.g., https://yourdomain.com)'
      )
    }

    // RP_ID is the hostname without protocol or port
    const rpID = url.hostname

    // Origin is the full protocol + hostname + port (if non-standard)
    const origin = url.origin

    // Support localhost for development
    const origins = [origin]
    if (rpID === 'localhost' || rpID === '127.0.0.1') {
      // Allow both localhost and 127.0.0.1 for development
      origins.push('http://localhost:3000', 'http://127.0.0.1:3000')
    }

    return {
      rpID,
      rpName: settings.companyName || 'ViTransfer',
      origins,
    }
  } catch (error) {
    // Re-throw configuration errors
    if (error instanceof Error && error.message.startsWith('PASSKEY_CONFIG_ERROR')) {
      throw error
    }

    console.error('Error fetching WebAuthn config:', error)
    throw new Error('Failed to retrieve PassKey configuration. Please check Settings.')
  }
}

/**
 * Check if PassKey authentication is properly configured
 *
 * STRICT VALIDATION:
 * - Production: Real domain + HTTPS enabled
 * - Development: Localhost + HTTPS disabled
 * - NO MIXED CONFIGURATIONS (localhost+HTTPS or domain+no-HTTPS)
 *
 * Returns false if appDomain is not set or configuration is invalid
 */
export async function isPasskeyConfigured(): Promise<boolean> {
  try {
    const config = await getWebAuthnConfig()
    const httpsEnabled = await isHttpsEnabled()

    const isLocalhost =
      config.rpID === 'localhost' ||
      config.rpID === '127.0.0.1'

    // Valid configurations (no mixing):
    // 1. Production: Real domain + HTTPS enabled
    // 2. Development: Localhost + HTTPS disabled
    const isValidConfig =
      (!isLocalhost && httpsEnabled) ||
      (isLocalhost && !httpsEnabled)

    return isValidConfig
  } catch (error) {
    return false
  }
}

/**
 * Get detailed passkey configuration status
 * Used for admin UI to show why passkey is not available
 */
export async function getPasskeyConfigStatus(): Promise<{
  available: boolean
  reason?: string
  config?: {
    domain: string
    httpsEnabled: boolean
    isLocalhost: boolean
  }
}> {
  try {
    const config = await getWebAuthnConfig()
    const httpsEnabled = await isHttpsEnabled()

    const isLocalhost =
      config.rpID === 'localhost' ||
      config.rpID === '127.0.0.1'

    // Early return for invalid localhost configuration
    if (isLocalhost && httpsEnabled) {
      return {
        available: false,
        reason: 'Invalid configuration: Localhost requires HTTPS to be disabled',
        config: {
          domain: config.rpID,
          httpsEnabled,
          isLocalhost,
        },
      }
    }

    // Early return for invalid production configuration
    if (!isLocalhost && !httpsEnabled) {
      return {
        available: false,
        reason: 'Invalid configuration: Production domain requires HTTPS to be enabled',
        config: {
          domain: config.rpID,
          httpsEnabled,
          isLocalhost,
        },
      }
    }

    // Valid configuration
    return {
      available: true,
      config: {
        domain: config.rpID,
        httpsEnabled,
        isLocalhost,
      },
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('PASSKEY_CONFIG_ERROR')) {
      return {
        available: false,
        reason: error.message.replace('PASSKEY_CONFIG_ERROR: ', ''),
      }
    }

    return {
      available: false,
      reason: 'Domain not configured. Set appDomain in Settings.',
    }
  }
}

