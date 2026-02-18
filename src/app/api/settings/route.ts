import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt, decrypt } from '@/lib/encryption'
import { rateLimit } from '@/lib/rate-limit'
import { isSmtpConfigured } from '@/lib/email'
import { getFilePath } from '@/lib/storage'
import { flushPendingAdminNotifications } from '@/lib/notifications'
import fs from 'fs/promises'
export const runtime = 'nodejs'



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
    maxRequests: 120,
    message: 'Too many requests. Please slow down.'
  }, 'settings-read', authResult.id)
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

  try {
    const body = await request.json()

    const {
      defaultTheme,
      accentColor,
      companyName,
      brandingLogoPath,
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
      maxUploadSizeGB,
      defaultTimestampDisplay,
      autoApproveProject,
      adminNotificationSchedule,
      adminNotificationTime,
      adminNotificationDay,
      defaultUsePreviewForApprovedPlayback,
      defaultAllowClientAssetUpload,
      emailHeaderStyle,
      maxCommentAttachments,
    } = body

    // SECURITY: Validate theme setting
    if (defaultTheme !== undefined) {
      const validThemes = ['auto', 'light', 'dark']
      if (!validThemes.includes(defaultTheme)) {
        return NextResponse.json(
          { error: 'Invalid theme. Must be auto, light, or dark.' },
          { status: 400 }
        )
      }
    }

    // SECURITY: Validate accent color
    if (accentColor !== undefined) {
      const validColors = ['blue', 'purple', 'green', 'orange', 'red', 'pink', 'teal', 'amber', 'stone', 'gold']
      if (!validColors.includes(accentColor)) {
        return NextResponse.json(
          { error: 'Invalid accent color.' },
          { status: 400 }
        )
      }
    }

    // SECURITY: Validate email header style
    if (emailHeaderStyle !== undefined) {
      const validStyles = ['NONE', 'LOGO_ONLY', 'NAME_ONLY', 'LOGO_AND_NAME']
      if (!validStyles.includes(emailHeaderStyle)) {
        return NextResponse.json(
          { error: 'Invalid email header style. Must be NONE, LOGO_ONLY, NAME_ONLY, or LOGO_AND_NAME.' },
          { status: 400 }
        )
      }
    }

    if (brandingLogoPath !== undefined && brandingLogoPath !== null && typeof brandingLogoPath !== 'string') {
      return NextResponse.json(
        { error: 'Invalid branding logo path.' },
        { status: 400 }
      )
    }

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

    if (defaultTimestampDisplay !== undefined) {
      const valid = ['TIMECODE', 'AUTO']
      if (!valid.includes(defaultTimestampDisplay)) {
        return NextResponse.json(
          { error: 'Invalid timestamp display. Must be TIMECODE or AUTO.' },
          { status: 400 }
        )
      }
    }

    if (maxUploadSizeGB !== undefined && maxUploadSizeGB !== null) {
      const parsed = Number(maxUploadSizeGB)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        return NextResponse.json(
          { error: 'Max upload size must be an integer between 1 and 100 GB.' },
          { status: 400 }
        )
      }
    }

    if (maxCommentAttachments !== undefined && maxCommentAttachments !== null) {
      const parsed = Number(maxCommentAttachments)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
        return NextResponse.json(
          { error: 'Max comment attachments must be an integer between 1 and 50.' },
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
      defaultTheme,
      accentColor,
      companyName,
      brandingLogoPath,
      emailHeaderStyle,
      smtpServer,
      smtpPort: smtpPort ? parseInt(smtpPort, 10) : null,
      smtpUsername,
      smtpFromAddress,
      smtpSecure,
      appDomain,
      defaultPreviewResolution,
      defaultWatermarkEnabled,
      defaultWatermarkText,
      maxUploadSizeGB: maxUploadSizeGB !== undefined && maxUploadSizeGB !== null ? Number(maxUploadSizeGB) : undefined,
      maxCommentAttachments: maxCommentAttachments !== undefined && maxCommentAttachments !== null ? Number(maxCommentAttachments) : undefined,
      defaultTimestampDisplay,
      autoApproveProject,
      adminNotificationSchedule,
      adminNotificationTime,
      adminNotificationDay: adminNotificationDay !== undefined ? adminNotificationDay : null,
      defaultUsePreviewForApprovedPlayback,
      defaultAllowClientAssetUpload,
    }

    // Only update password if it's not the placeholder
    if (passwordUpdate !== undefined) {
      updateData.smtpPassword = passwordUpdate
    }

    // Check if admin notification schedule is changing (to flush pending notifications)
    let previousAdminSchedule: string | null = null
    if (adminNotificationSchedule !== undefined) {
      const current = await prisma.settings.findUnique({
        where: { id: 'default' },
        select: { adminNotificationSchedule: true }
      })
      previousAdminSchedule = current?.adminNotificationSchedule || null
    }

    // Update or create the settings
    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: updateData,
      create: {
        id: 'default',
        defaultTheme: defaultTheme || 'auto',
        accentColor: accentColor || 'blue',
        companyName,
        brandingLogoPath: brandingLogoPath || null,
        emailHeaderStyle: emailHeaderStyle || 'LOGO_AND_NAME',
        smtpServer,
        smtpPort: smtpPort ? parseInt(smtpPort, 10) : null,
        smtpUsername,
        smtpPassword: passwordUpdate || null,
        smtpFromAddress,
        smtpSecure,
        appDomain,
        defaultPreviewResolution,
        defaultWatermarkText,
        maxUploadSizeGB: maxUploadSizeGB !== undefined && maxUploadSizeGB !== null ? Number(maxUploadSizeGB) : 1,
        maxCommentAttachments: maxCommentAttachments !== undefined && maxCommentAttachments !== null ? Number(maxCommentAttachments) : 10,
        defaultTimestampDisplay: defaultTimestampDisplay || 'TIMECODE',
        autoApproveProject,
        adminNotificationSchedule: adminNotificationSchedule || 'IMMEDIATE',
        adminNotificationTime,
        adminNotificationDay: adminNotificationDay !== undefined ? adminNotificationDay : null,
      },
    })

    // If accent color changed, invalidate cached default logo PNGs
    if (accentColor !== undefined) {
      const defaultCachePrefix = 'branding/default-logo-'
      const validColors = ['blue', 'purple', 'green', 'orange', 'red', 'pink', 'teal', 'amber', 'stone', 'gold']
      for (const color of validColors) {
        try {
          await fs.unlink(getFilePath(`${defaultCachePrefix}${color}.png`))
        } catch {
          // Ignore if file doesn't exist
        }
      }
    }

    // Flush pending admin notifications when schedule changes
    if (previousAdminSchedule !== null && adminNotificationSchedule !== previousAdminSchedule) {
      console.log(`[SETTINGS] Admin notification schedule changed: ${previousAdminSchedule} → ${adminNotificationSchedule}`)
      // Fire-and-forget: don't block the response
      void flushPendingAdminNotifications()
    }

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
