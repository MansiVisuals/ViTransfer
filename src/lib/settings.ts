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

