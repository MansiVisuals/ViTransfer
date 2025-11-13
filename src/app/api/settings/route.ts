import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt, decrypt } from '@/lib/encryption'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult // Return 401/403 response
  }

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

    // Don't expose decrypted password - return placeholder if set
    const safeSettings = {
      ...settings,
      smtpPassword: settings.smtpPassword ? '••••••••' : null,
    }

    return NextResponse.json({
      ...safeSettings,
      security: securitySettings,
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

    // Encrypt sensitive fields before storing
    const encryptedPassword = smtpPassword ? encrypt(smtpPassword) : null

    // Update or create the settings
    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: {
        companyName,
        smtpServer,
        smtpPort: smtpPort ? parseInt(smtpPort) : null,
        smtpUsername,
        smtpPassword: encryptedPassword,
        smtpFromAddress,
        smtpSecure,
        appDomain,
        defaultPreviewResolution,
        defaultWatermarkText,
        autoApproveProject,
        adminNotificationSchedule,
        adminNotificationTime,
        adminNotificationDay: adminNotificationDay !== undefined ? adminNotificationDay : null,
      },
      create: {
        id: 'default',
        companyName,
        smtpServer,
        smtpPort: smtpPort ? parseInt(smtpPort) : null,
        smtpUsername,
        smtpPassword: encryptedPassword,
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

    // Don't expose decrypted password - return placeholder if set
    const safeSettings = {
      ...settings,
      smtpPassword: settings.smtpPassword ? '••••••••' : null,
    }

    return NextResponse.json(safeSettings)
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    )
  }
}
