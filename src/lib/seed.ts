import { prisma } from './db'
import { hashPassword } from './encryption'

/**
 * Ensure security settings are initialized
 */
async function ensureSecuritySettings() {
  try {
    await prisma.securitySettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        hotlinkProtection: 'LOG_ONLY',
        ipRateLimit: 1000, // High limit for video streaming with HTTP Range requests
        sessionRateLimit: 600, // 10 req/sec average for video buffering/seeking
        passwordAttempts: 5,
        trackAnalytics: true,
        trackSecurityLogs: true,
        viewSecurityEvents: false, // Hide security dashboard by default
      },
      update: {
        // Don't overwrite existing settings
      },
    })
  } catch (error) {
    console.error('Error initializing security settings:', error)
    // Don't throw - app should still start even if this fails
  }
}

/**
 * Ensure default admin user exists
 * This is called automatically when the app starts
 *
 * SECURITY: Only creates default admin if NO admin users exist in the database
 * This prevents recreating default credentials on rebuilds (security risk)
 */
export async function ensureDefaultAdmin() {
  try {
    // SECURITY: Check if ANY admin exists (not just the default one)
    // This prevents recreating default admin after it's been changed/removed
    const anyAdmin = await prisma.user.findFirst({
      where: {
        role: 'ADMIN'
      }
    })

    if (anyAdmin) {
      // Initialize security settings even if admin exists
      await ensureSecuritySettings()
      return
    }

  // No admin exists - create default admin with credentials from env when provided
  // This allows initializing a secure admin via the .env file (ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD)
  const adminUsername = process.env.ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.ADMIN_PASSWORD || 'adminpassword'
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'

    // Create default admin user (using env values if provided)
    const hashedPassword = await hashPassword(adminPassword)

    await prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        name: 'Admin',
        role: 'ADMIN',
      },
    })

    // Initialize security settings
    await ensureSecuritySettings()
  } catch (error) {
    console.error('Error ensuring default admin:', error)
    // Don't throw - app should still start even if this fails
  }
}
