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

    // No admin exists - require credentials from environment variables
    // SECURITY: No default credentials - must be set in .env file
    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminEmail || !adminPassword) {
      console.error('')
      console.error('===============================================================')
      console.error('CRITICAL ERROR: Admin credentials not configured!')
      console.error('===============================================================')
      console.error('')
      console.error('No admin user exists and ADMIN_EMAIL/ADMIN_PASSWORD are not set.')
      console.error('')
      console.error('REQUIRED: Set these environment variables in your .env file:')
      console.error('  ADMIN_EMAIL=your-admin@example.com')
      console.error('  ADMIN_PASSWORD=YourSecurePassword123')
      console.error('')
      console.error('Then restart the application.')
      console.error('===============================================================')
      console.error('')
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment variables for initial setup')
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(adminEmail)) {
      throw new Error(`Invalid ADMIN_EMAIL format: ${adminEmail}`)
    }

    // Validate password strength
    if (adminPassword.length < 8) {
      throw new Error('ADMIN_PASSWORD must be at least 8 characters long')
    }

    console.log('')
    console.log('===============================================================')
    console.log('Creating initial admin user...')
    console.log('===============================================================')
    console.log(`Email: ${adminEmail}`)
    console.log('Password: ********')
    console.log('===============================================================')
    console.log('')

    const adminUsername = process.env.ADMIN_USERNAME || adminEmail.split('@')[0]
    const hashedPassword = await hashPassword(adminPassword)

    await prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        name: process.env.ADMIN_NAME || 'Admin',
        role: 'ADMIN',
      },
    })

    console.log('Admin user created successfully!')
    console.log('')

    // Initialize security settings
    await ensureSecuritySettings()
  } catch (error) {
    console.error('Error ensuring default admin:', error)
    // Don't throw - app should still start even if this fails
  }
}
