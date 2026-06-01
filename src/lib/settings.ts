import { prisma } from './db'
import { getRedis } from './redis'
import { logError, logMessage } from '@/lib/logging'

// Simple in-memory cache for frequently read settings to avoid repeated DB hits
const SETTINGS_CACHE_TTL_MS = 60_000
type CachedValue<T> = { value: T; expiresAt: number }
const cachedRateLimits: CachedValue<{
  ipRateLimit: number
  sessionRateLimit: number
  shareSessionRateLimit?: number
  shareTokenTtlSeconds?: number
}> = { value: { ipRateLimit: 1000, sessionRateLimit: 600 }, expiresAt: 0 }
const cachedSessionTimeout: CachedValue<number> = { value: 15 * 60, expiresAt: 0 }
const cachedAdminSessionTimeout: CachedValue<number> = { value: 15 * 60, expiresAt: 0 }
const cachedSmtpConfigured: CachedValue<boolean> = { value: false, expiresAt: 0 }

function getHttpsEnvironmentOverride(): boolean | null {
  const envValue = process.env.HTTPS_ENABLED
  if (envValue === undefined) return null
  return envValue === 'true' || envValue === '1'
}

export async function invalidateSecuritySettingsCache(): Promise<void> {
  cachedRateLimits.expiresAt = 0
  cachedSessionTimeout.expiresAt = 0
  cachedAdminSessionTimeout.expiresAt = 0

  const redis = getRedis()
  await redis.del('app:security_settings')
}

/**
 * Check if SMTP is configured
 */
export async function isSmtpConfigured(): Promise<boolean> {
  const now = Date.now()
  if (cachedSmtpConfigured.expiresAt > now) {
    return cachedSmtpConfigured.value
  }

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

    const configured = !!(settings?.smtpServer && settings?.smtpPort && settings?.smtpUsername && settings?.smtpPassword)
    cachedSmtpConfigured.value = configured
    cachedSmtpConfigured.expiresAt = now + SETTINGS_CACHE_TTL_MS

    return configured
  } catch (error) {
    logError('Error checking SMTP configuration:', error)
    return cachedSmtpConfigured.value
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
    logError('Error fetching auto-approve setting:', error)
    return true // Default to enabled on error
  }
}

/**
 * Get client session timeout in seconds from security settings
 * Used for:
 * - Share token TTL guidance
 * - Video access token TTL
 * - Redis session mappings for content streaming
 *
 * Note: Admin dashboard inactivity logout is configured separately via admin session timeout settings.
 */
export async function getClientSessionTimeoutSeconds(): Promise<number> {
  const now = Date.now()
  if (cachedSessionTimeout.expiresAt > now) {
    return cachedSessionTimeout.value
  }

  try {
    const settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: {
        sessionTimeoutValue: true,
        sessionTimeoutUnit: true,
      },
    })

    if (!settings) {
      cachedSessionTimeout.value = 15 * 60
      cachedSessionTimeout.expiresAt = now + SETTINGS_CACHE_TTL_MS
      return cachedSessionTimeout.value
    }

    const value = settings.sessionTimeoutValue
    const unit = settings.sessionTimeoutUnit

    switch (unit) {
      case 'MINUTES':
        cachedSessionTimeout.value = value * 60
        break
      case 'HOURS':
        cachedSessionTimeout.value = value * 60 * 60
        break
      case 'DAYS':
        cachedSessionTimeout.value = value * 24 * 60 * 60
        break
      case 'WEEKS':
        cachedSessionTimeout.value = value * 7 * 24 * 60 * 60
        break
      default:
        cachedSessionTimeout.value = 15 * 60
        break
    }

    cachedSessionTimeout.expiresAt = now + SETTINGS_CACHE_TTL_MS
    return cachedSessionTimeout.value
  } catch (error) {
    logError('Error fetching client session timeout:', error)
    return cachedSessionTimeout.value
  }
}

/**
 * Get admin session timeout in seconds from security settings
 * Used for admin access token TTL.
 * Environment variables ADMIN_ACCESS_TTL_SECONDS / ADMIN_REFRESH_TTL_SECONDS take precedence.
 */
export async function getAdminSessionTimeoutSeconds(): Promise<number> {
  const envOverride = process.env.ADMIN_ACCESS_TTL_SECONDS
  if (envOverride) {
    const parsed = parseInt(envOverride, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  const now = Date.now()
  if (cachedAdminSessionTimeout.expiresAt > now) {
    return cachedAdminSessionTimeout.value
  }

  try {
    const settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: {
        adminSessionTimeoutValue: true,
        adminSessionTimeoutUnit: true,
      },
    })

    if (!settings) {
      cachedAdminSessionTimeout.value = 15 * 60
      cachedAdminSessionTimeout.expiresAt = now + SETTINGS_CACHE_TTL_MS
      return cachedAdminSessionTimeout.value
    }

    const value = settings.adminSessionTimeoutValue
    const unit = settings.adminSessionTimeoutUnit

    switch (unit) {
      case 'MINUTES':
        cachedAdminSessionTimeout.value = value * 60
        break
      case 'HOURS':
        cachedAdminSessionTimeout.value = value * 60 * 60
        break
      case 'DAYS':
        cachedAdminSessionTimeout.value = value * 24 * 60 * 60
        break
      case 'WEEKS':
        cachedAdminSessionTimeout.value = value * 7 * 24 * 60 * 60
        break
      default:
        cachedAdminSessionTimeout.value = 15 * 60
        break
    }

    cachedAdminSessionTimeout.expiresAt = now + SETTINGS_CACHE_TTL_MS
    return cachedAdminSessionTimeout.value
  } catch (error) {
    logError('Error fetching admin session timeout:', error)
    return cachedAdminSessionTimeout.value
  }
}

/**
 * Check if HTTPS enforcement is enabled
 *
 * Priority: Environment variable (HTTPS_ENABLED) > Database setting > Default (true)
 * IMPORTANT: Environment variable ALWAYS takes precedence (escape hatch for localhost).
 */
/**
 * Initialize security settings from environment variables on container startup
 */
export async function initializeSecuritySettings() {
  try {
    const httpsEnabled = getHttpsEnvironmentOverride()

    if (httpsEnabled !== null) {
      await prisma.securitySettings.upsert({
        where: { id: 'default' },
        update: { httpsEnabled },
        create: { id: 'default', httpsEnabled },
      })

      logMessage(`[INIT] HTTPS_ENABLED environment variable detected. Set database value to: ${httpsEnabled}`)
    }
  } catch (error) {
    logError('[INIT] Error initializing security settings from environment:', error)
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
  const envOverride = getHttpsEnvironmentOverride()
  if (envOverride !== null) {
    return envOverride
  }

  try {
    const settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: { httpsEnabled: true },
    })

    // Default to true for production security
    return settings?.httpsEnabled ?? true
  } catch (error) {
    logError('Error checking HTTPS enabled status:', error)
    // Default to true even on error for security
    return true
  }
}

export async function getRateLimitSettings(): Promise<{
  ipRateLimit: number
  sessionRateLimit: number
  shareSessionRateLimit?: number
  shareTokenTtlSeconds?: number
}> {
  const now = Date.now()
  if (cachedRateLimits.expiresAt > now) {
    return cachedRateLimits.value
  }

  try {
    const settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: {
        ipRateLimit: true,
        sessionRateLimit: true,
        shareSessionRateLimit: true,
        shareTokenTtlSeconds: true,
      },
    })

    cachedRateLimits.value = {
      ipRateLimit: settings?.ipRateLimit ?? 1000,
      sessionRateLimit: settings?.sessionRateLimit ?? 600,
      shareSessionRateLimit: settings?.shareSessionRateLimit ?? 300,
      shareTokenTtlSeconds: settings?.shareTokenTtlSeconds ?? undefined,
    }
    cachedRateLimits.expiresAt = now + SETTINGS_CACHE_TTL_MS

    return cachedRateLimits.value
  } catch (error) {
    return cachedRateLimits.value
  }
}

export function isHttpsManagedByEnvironment(): boolean {
  return getHttpsEnvironmentOverride() !== null
}

/**
 * Share token TTL (seconds)
 * Uses the same client session timeout setting to keep share JWTs aligned with content access TTLs.
 */
export async function getShareTokenTtlSeconds(): Promise<number> {
  const { shareTokenTtlSeconds } = await getRateLimitSettings()
  if (shareTokenTtlSeconds && shareTokenTtlSeconds > 0) {
    return shareTokenTtlSeconds
  }
  return getClientSessionTimeoutSeconds()
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

    const origin = url.origin

    const origins = [origin]
    if (rpID === 'localhost' || rpID === '127.0.0.1') {
      origins.push('http://localhost:3000', 'http://127.0.0.1:3000')
    }

    return {
      rpID,
      rpName: settings.companyName || 'ViTransfer',
      origins,
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PASSKEY_CONFIG_ERROR')) {
      throw error
    }

    logError('Error fetching WebAuthn config:', error)
    throw new Error('Failed to retrieve PassKey configuration. Please check Settings.')
  }
}

/**
 * Check if PassKey authentication is properly configured
 *
 * Production: Real domain + HTTPS enabled
 * Development: Localhost + HTTPS disabled
 */
export async function isPasskeyConfigured(): Promise<boolean> {
  try {
    const config = await getWebAuthnConfig()
    const httpsEnabled = await isHttpsEnabled()

    const isLocalhost =
      config.rpID === 'localhost' ||
      config.rpID === '127.0.0.1'

    // Valid configurations (no mixing):
    const isValidConfig =
      (!isLocalhost && httpsEnabled) ||
      (isLocalhost && !httpsEnabled)

    return isValidConfig
  } catch (error) {
    return false
  }
}

/**
 * Get detailed passkey configuration status for admin UI
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
