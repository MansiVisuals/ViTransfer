import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt, decrypt } from '@/lib/encryption'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'
import { rateLimit } from '@/lib/rate-limit'
import { isSmtpConfigured } from '@/lib/email'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult // Return 401/403 response
  }

  // Rate limiting to prevent enumeration/scraping
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many requests. Please slow down.'
  }, 'settings-read')
  if (rateLimitResult) return rateLimitResult

  try {
    // Get or create the default settings
    let settings = await prisma.settings.findUnique({
      where: { id: 'default' },
    })

    if (!settings) {
      // Create default settings if they don't exist
      settings = await prisma.settings.create({
        data: {
          id: 'default',
        },
      })
    }

    // Get security settings
    let securitySettings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
    })

    if (!securitySettings) {
      // Create default security settings if they don't exist
      securitySettings = await prisma.securitySettings.create({
        data: {
          id: 'default',
        },
      })
    }

    // Decrypt sensitive fields before sending to admin
    const decryptedSettings = {
      ...settings,
      smtpPassword: settings.smtpPassword ? decrypt(settings.smtpPassword) : null,
    }

    // Check SMTP configuration status (reuse centralized helper)
    const smtpConfigured = await isSmtpConfigured()

    return NextResponse.json({
      ...decryptedSettings,
      security: securitySettings,
      smtpConfigured,
    })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult // Return 401/403 response
  }

  // CSRF Protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  try {
    const body = await request.json()

    const {
      companyName,
      smtpServer,
      smtpPort,
      smtpUsername,
      smtpPassword,
      smtpFromAddress,
      smtpSecure,
      appDomain,
      defaultPreviewResolution,
      defaultWatermarkEnabled,
      defaultWatermarkText,
      autoApproveProject,
      adminNotificationSchedule,
      adminNotificationTime,
      adminNotificationDay,
    } = body

    // SECURITY: Validate notification schedule
    if (adminNotificationSchedule !== undefined) {
      const validSchedules = ['IMMEDIATE', 'HOURLY', 'DAILY', 'WEEKLY']
      if (!validSchedules.includes(adminNotificationSchedule)) {
        return NextResponse.json(
          { error: 'Invalid notification schedule. Must be IMMEDIATE, HOURLY, DAILY, or WEEKLY.' },
          { status: 400 }
        )
      }
    }

    // SECURITY: Validate time format (HH:MM)
    if (adminNotificationTime !== undefined && adminNotificationTime !== null) {
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/
      if (!timeRegex.test(adminNotificationTime)) {
        return NextResponse.json(
          { error: 'Invalid time format. Must be HH:MM (24-hour format).' },
          { status: 400 }
        )
      }
    }

    // SECURITY: Validate day (0-6)
    if (adminNotificationDay !== undefined && adminNotificationDay !== null) {
      if (!Number.isInteger(adminNotificationDay) || adminNotificationDay < 0 || adminNotificationDay > 6) {
        return NextResponse.json(
          { error: 'Invalid day. Must be 0-6 (Sunday-Saturday).' },
          { status: 400 }
        )
      }
    }

    // SECURITY: Validate watermark text (same rules as FFmpeg sanitization)
    // Only allow alphanumeric, spaces, and safe punctuation: - _ . ( )
    if (defaultWatermarkText) {
      const invalidChars = defaultWatermarkText.match(/[^a-zA-Z0-9\s\-_.()]/g)
      if (invalidChars) {
        const uniqueInvalid = [...new Set(invalidChars)].join(', ')
        return NextResponse.json(
          {
            error: 'Invalid characters in watermark text',
            details: `Watermark text contains invalid characters: ${uniqueInvalid}. Only letters, numbers, spaces, and these characters are allowed: - _ . ( )`
          },
          { status: 400 }
        )
      }

      // Additional length check (prevent excessively long watermarks)
      if (defaultWatermarkText.length > 100) {
        return NextResponse.json(
          {
            error: 'Watermark text too long',
            details: 'Watermark text must be 100 characters or less'
          },
          { status: 400 }
        )
      }
    }

    // Handle SMTP password update - only update if actually changed
    let passwordUpdate: string | null | undefined
    if (smtpPassword !== undefined) {
      // Get current settings to compare password
      const currentSettings = await prisma.settings.findUnique({
        where: { id: 'default' },
        select: { smtpPassword: true },
      })

      // Decrypt current password for comparison
      const currentPassword = currentSettings?.smtpPassword ? decrypt(currentSettings.smtpPassword) : null

      // Only update if password actually changed
      if (smtpPassword === null || smtpPassword === '') {
        // Clearing password
        if (currentPassword !== null) {
          passwordUpdate = null
        } else {
          passwordUpdate = undefined // Already null, don't update
        }
      } else {
        // Setting/updating password - only if different from current
        if (smtpPassword !== currentPassword) {
          passwordUpdate = encrypt(smtpPassword)
        } else {
          passwordUpdate = undefined // Same password, don't update
        }
      }
    } else {
      // Password not provided in request, don't update
      passwordUpdate = undefined
    }

    // Build update data (only include password if it should be updated)
    const updateData: any = {
      companyName,
      smtpServer,
      smtpPort: smtpPort ? parseInt(smtpPort) : null,
      smtpUsername,
      smtpFromAddress,
      smtpSecure,
      appDomain,
      defaultPreviewResolution,
      defaultWatermarkEnabled,
      defaultWatermarkText,
      autoApproveProject,
      adminNotificationSchedule,
      adminNotificationTime,
      adminNotificationDay: adminNotificationDay !== undefined ? adminNotificationDay : null,
    }

    // Only update password if it's not the placeholder
    if (passwordUpdate !== undefined) {
      updateData.smtpPassword = passwordUpdate
    }

    // Update or create the settings
    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: updateData,
      create: {
        id: 'default',
        companyName,
        smtpServer,
        smtpPort: smtpPort ? parseInt(smtpPort) : null,
        smtpUsername,
        smtpPassword: passwordUpdate || null,
        smtpFromAddress,
        smtpSecure,
        appDomain,
        defaultPreviewResolution,
        defaultWatermarkText,
        autoApproveProject,
        adminNotificationSchedule: adminNotificationSchedule || 'IMMEDIATE',
        adminNotificationTime,
        adminNotificationDay: adminNotificationDay !== undefined ? adminNotificationDay : null,
      },
    })

    // Decrypt sensitive fields before sending to admin
    const decryptedSettings = {
      ...settings,
      smtpPassword: settings.smtpPassword ? decrypt(settings.smtpPassword) : null,
    }

    return NextResponse.json(decryptedSettings)
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    )
  }
}
