import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteFile, deleteDirectory } from '@/lib/storage'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt, decrypt } from '@/lib/encryption'
import { cookies } from 'next/headers'
import { isSmtpConfigured } from '@/lib/email'
import { invalidateProjectSessions } from '@/lib/session-invalidation'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: 60 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
  }, 'project-read')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        videos: {
          orderBy: { version: 'desc' },
        },
        comments: {
          where: { parentId: null },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
              }
            },
            replies: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    email: true,
                  }
                }
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        recipients: {
          orderBy: [
            { isPrimary: 'desc' },
            { createdAt: 'asc' },
          ],
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Check SMTP configuration status
    const smtpConfigured = await isSmtpConfigured()

    // Convert BigInt fields to strings for JSON serialization
    const projectData = {
      ...project,
      videos: project.videos.map((video: any) => ({
        ...video,
        originalFileSize: video.originalFileSize.toString(),
      })),
      // Decrypt password for admin viewing (only sent to authenticated admins)
      sharePasswordDecrypted: project.sharePassword ? decrypt(project.sharePassword) : null,
      // Include SMTP status for frontend to disable/enable notification features
      smtpConfigured,
    }

    return NextResponse.json(projectData)
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to process request' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // CSRF protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  try {
    const { id } = await params
    const body = await request.json()

    // Build update data object
    const updateData: any = {}

    // Handle basic project details
    if (body.title !== undefined) {
      updateData.title = body.title
    }
    if (body.slug !== undefined) {
      // Check if slug is unique (excluding current project)
      const existingProject = await prisma.project.findFirst({
        where: {
          slug: body.slug,
          NOT: { id }
        }
      })
      
      if (existingProject) {
        return NextResponse.json(
          { error: 'This share link is already in use. Please choose a different one.' },
          { status: 409 }
        )
      }
      
      updateData.slug = body.slug
    }
    if (body.description !== undefined) {
      updateData.description = body.description || null
    }
    if (body.companyName !== undefined) {
      // Validate companyName (CRLF protection)
      if (body.companyName && /[\r\n]/.test(body.companyName)) {
        return NextResponse.json(
          { error: 'Company name cannot contain line breaks' },
          { status: 400 }
        )
      }
      updateData.companyName = body.companyName || null
    }

    // Handle status update (for approval)
    if (body.status !== undefined) {
      const validStatuses = ['IN_REVIEW', 'APPROVED', 'SHARE_ONLY']
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updateData.status = body.status

      // When approving project, just set the status and timestamp
      // Video approvals are handled separately by the admin
      if (body.status === 'APPROVED') {
        updateData.approvedAt = new Date()
      }

      // When changing status away from APPROVED, clear approval metadata
      if (body.status !== 'APPROVED') {
        updateData.approvedAt = null
      }
    }

    // Handle revision settings
    if (body.enableRevisions !== undefined) {
      updateData.enableRevisions = body.enableRevisions
    }
    if (body.maxRevisions !== undefined) {
      updateData.maxRevisions = body.maxRevisions
    }

    // Handle comment restrictions
    if (body.restrictCommentsToLatestVersion !== undefined) {
      updateData.restrictCommentsToLatestVersion = body.restrictCommentsToLatestVersion
    }
    if (body.hideFeedback !== undefined) {
      updateData.hideFeedback = body.hideFeedback
    }

    // Handle video processing settings
    if (body.previewResolution !== undefined) {
      const validResolutions = ['720p', '1080p', '2160p']
      if (!validResolutions.includes(body.previewResolution)) {
        return NextResponse.json({ error: 'Invalid resolution' }, { status: 400 })
      }
      updateData.previewResolution = body.previewResolution
    }

    if (body.watermarkEnabled !== undefined) {
      updateData.watermarkEnabled = body.watermarkEnabled
    }

    if (body.watermarkText !== undefined) {
      // SECURITY: Validate watermark text (same rules as FFmpeg sanitization)
      // Only allow alphanumeric, spaces, and safe punctuation: - _ . ( )
      if (body.watermarkText) {
        const invalidChars = body.watermarkText.match(/[^a-zA-Z0-9\s\-_.()]/g)
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
        if (body.watermarkText.length > 100) {
          return NextResponse.json(
            {
              error: 'Watermark text too long',
              details: 'Watermark text must be 100 characters or less'
            },
            { status: 400 }
          )
        }
      }

      updateData.watermarkText = body.watermarkText || null
    }

    // Handle password update - only update if actually changed
    let passwordWasChanged = false
    if (body.sharePassword !== undefined) {
      // Get current project to compare password
      const currentProject = await prisma.project.findUnique({
        where: { id },
        select: { sharePassword: true }
      })

      if (!currentProject) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      // Decrypt current password for comparison
      const currentPassword = currentProject.sharePassword ? decrypt(currentProject.sharePassword) : null

      // Only update if password actually changed
      if (body.sharePassword === null || body.sharePassword === '') {
        // Clearing password
        if (currentPassword !== null) {
          updateData.sharePassword = null
          passwordWasChanged = true
        }
      } else {
        // Setting/updating password - only if different from current
        if (body.sharePassword !== currentPassword) {
          updateData.sharePassword = encrypt(body.sharePassword)
          passwordWasChanged = true
        }
      }
    }

    // Handle authentication mode
    if (body.authMode !== undefined) {
      const validAuthModes = ['PASSWORD', 'OTP', 'BOTH', 'NONE']
      if (!validAuthModes.includes(body.authMode)) {
        return NextResponse.json({ error: 'Invalid authentication mode' }, { status: 400 })
      }
      updateData.authMode = body.authMode
    }

    // Handle client notification schedule
    if (body.clientNotificationSchedule !== undefined) {
      const validSchedules = ['IMMEDIATE', 'HOURLY', 'DAILY', 'WEEKLY']
      if (!validSchedules.includes(body.clientNotificationSchedule)) {
        return NextResponse.json(
          { error: 'Invalid notification schedule. Must be IMMEDIATE, HOURLY, DAILY, or WEEKLY.' },
          { status: 400 }
        )
      }
      updateData.clientNotificationSchedule = body.clientNotificationSchedule
    }
    if (body.clientNotificationTime !== undefined) {
      if (body.clientNotificationTime !== null) {
        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/
        if (!timeRegex.test(body.clientNotificationTime)) {
          return NextResponse.json(
            { error: 'Invalid time format. Must be HH:MM (24-hour format).' },
            { status: 400 }
          )
        }
      }
      updateData.clientNotificationTime = body.clientNotificationTime
    }
    if (body.clientNotificationDay !== undefined) {
      if (body.clientNotificationDay !== null) {
        if (!Number.isInteger(body.clientNotificationDay) || body.clientNotificationDay < 0 || body.clientNotificationDay > 6) {
          return NextResponse.json(
            { error: 'Invalid day. Must be 0-6 (Sunday-Saturday).' },
            { status: 400 }
          )
        }
      }
      updateData.clientNotificationDay = body.clientNotificationDay
    }

    // Update the project in database FIRST (before invalidating sessions)
    const project = await prisma.project.update({
      where: { id },
      data: updateData,
    })

    // SECURITY: After password is updated in DB, invalidate ALL sessions for this project
    // This prevents race condition where client could authenticate with old password
    // after sessions are invalidated but before DB is updated
    if (passwordWasChanged) {
      try {
        const invalidatedCount = await invalidateProjectSessions(id)
        console.log(`[SECURITY] Project password changed - invalidated ${invalidatedCount} sessions for project ${id}`)
      } catch (error) {
        console.error('[SECURITY] Failed to invalidate project sessions after password change:', error)
        // Don't fail the request if session invalidation fails
      }

      // Also clear current admin's cookie if they have one
      const cookieStore = await cookies()
      const authSessionId = cookieStore.get('share_auth')?.value
      if (authSessionId) {
        cookieStore.delete('share_auth')
      }
    }

    return NextResponse.json(project)
  } catch (error) {
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // CSRF protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  try {
    const { id } = await params
    // Get project with all videos
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        videos: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Delete all video files from storage
    for (const video of project.videos) {
      try {
        // Delete original file
        if (video.originalStoragePath) {
          await deleteFile(video.originalStoragePath)
        }

        // Delete preview files
        if (video.preview1080Path) {
          await deleteFile(video.preview1080Path)
        }
        if (video.preview720Path) {
          await deleteFile(video.preview720Path)
        }

        // Delete thumbnail
        if (video.thumbnailPath) {
          await deleteFile(video.thumbnailPath)
        }
      } catch (error) {
        console.error(`Failed to delete files for video ${video.id}:`, error)
        // Continue deleting other files even if one fails
      }
    }

    // Delete the entire project directory after all files are removed
    try {
      await deleteDirectory(`projects/${id}`)
    } catch (error) {
      console.error(`Failed to delete project directory for ${id}:`, error)
      // Continue even if directory deletion fails
    }

    // SECURITY: Invalidate all sessions for this project before deletion
    try {
      const invalidatedCount = await invalidateProjectSessions(id)
      console.log(`[SECURITY] Project deleted - invalidated ${invalidatedCount} sessions`)
    } catch (error) {
      console.error('[SECURITY] Failed to invalidate sessions during project deletion:', error)
      // Continue with deletion even if session invalidation fails
    }

    // Delete project and all related data (cascade will handle videos, comments, shares)
    await prisma.project.delete({
      where: { id: id },
    })

    return NextResponse.json({
      success: true,
      message: 'Project and all related files deleted successfully'
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    )
  }
}
