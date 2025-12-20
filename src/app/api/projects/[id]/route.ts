import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteFile, deleteDirectory } from '@/lib/storage'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt, decrypt } from '@/lib/encryption'
import { isSmtpConfigured } from '@/lib/email'
import { invalidateProjectSessions, invalidateShareTokensByProject } from '@/lib/session-invalidation'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeComment } from '@/lib/comment-sanitization'
import { z } from 'zod'
export const runtime = 'nodejs'




const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  companyName: z.string().max(200).nullable().optional(),
  status: z.enum(['IN_REVIEW', 'APPROVED', 'SHARE_ONLY']).optional(),
  enableRevisions: z.boolean().optional(),
  maxRevisions: z.number().int().min(0).max(50).optional(),
  restrictCommentsToLatestVersion: z.boolean().optional(),
  hideFeedback: z.boolean().optional(),
  previewResolution: z.enum(['720p', '1080p', '2160p']).optional(),
  watermarkEnabled: z.boolean().optional(),
  watermarkText: z.string().max(100).nullable().optional(),
  allowAssetDownload: z.boolean().optional(),
  sharePassword: z.string().max(200).nullable().optional(),
  authMode: z.enum(['PASSWORD', 'OTP', 'BOTH', 'NONE']).optional(),
  guestMode: z.boolean().optional(),
  guestLatestOnly: z.boolean().optional(),
  clientNotificationSchedule: z.enum(['IMMEDIATE', 'HOURLY', 'DAILY', 'WEEKLY']).optional(),
  clientNotificationTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).nullable().optional(),
  clientNotificationDay: z.number().int().min(0).max(6).nullable().optional(),
})

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

    // Determine fallback name for sanitization
    const primaryRecipient = project.recipients?.find((r: any) => r.isPrimary) || project.recipients?.[0]
    const fallbackName = project.companyName || primaryRecipient?.name || 'Client'

    // Sanitize/normalize comments to ensure timecodes are consistent
    const sanitizedComments = project.comments.map((comment: any) =>
      sanitizeComment(comment, true, true, fallbackName)
    )

    // Decrypt password for admin users (needed for settings form)
    const decryptedPassword = project.sharePassword ? decrypt(project.sharePassword) : null

    // Convert BigInt fields to strings for JSON serialization
    const projectData = {
      ...project,
      videos: project.videos.map((video: any) => ({
        ...video,
        originalFileSize: video.originalFileSize.toString(),
      })),
      comments: sanitizedComments,
      sharePassword: decryptedPassword,
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

  // Rate limiting: mutation throttle
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many project update requests. Please slow down.',
  }, 'project-update')
  if (rateLimitResult) return rateLimitResult

  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const validatedBody = parsed.data

    // Build update data object
    const updateData: any = {}

    // Handle basic project details
    if (validatedBody.title !== undefined) {
      updateData.title = validatedBody.title
    }
    if (validatedBody.slug !== undefined) {
      // Check if slug is unique (excluding current project)
      const existingProject = await prisma.project.findFirst({
        where: {
          slug: validatedBody.slug,
          NOT: { id }
        }
      })
      
      if (existingProject) {
        return NextResponse.json(
          { error: 'This share link is already in use. Please choose a different one.' },
          { status: 409 }
        )
      }
      
      updateData.slug = validatedBody.slug
    }
    if (validatedBody.description !== undefined) {
      updateData.description = validatedBody.description || null
    }
    if (validatedBody.companyName !== undefined) {
      // Validate companyName (CRLF protection)
      if (validatedBody.companyName && /[\r\n]/.test(validatedBody.companyName)) {
        return NextResponse.json(
          { error: 'Company name cannot contain line breaks' },
          { status: 400 }
        )
      }
      updateData.companyName = validatedBody.companyName || null
    }

    // Handle status update (for approval)
    if (validatedBody.status !== undefined) {
      updateData.status = validatedBody.status

      // When approving project, just set the status and timestamp
      // Video approvals are handled separately by the admin
      if (validatedBody.status === 'APPROVED') {
        updateData.approvedAt = new Date()
      }

      // When changing status away from APPROVED, clear approval metadata
      if (validatedBody.status !== 'APPROVED') {
        updateData.approvedAt = null
      }
    }

    // Handle revision settings
    if (validatedBody.enableRevisions !== undefined) {
      updateData.enableRevisions = validatedBody.enableRevisions
    }
    if (validatedBody.maxRevisions !== undefined) {
      updateData.maxRevisions = validatedBody.maxRevisions
    }

    // Handle comment restrictions
    if (validatedBody.restrictCommentsToLatestVersion !== undefined) {
      updateData.restrictCommentsToLatestVersion = validatedBody.restrictCommentsToLatestVersion
    }
    if (validatedBody.hideFeedback !== undefined) {
      updateData.hideFeedback = validatedBody.hideFeedback
    }

    // Handle video processing settings
    if (validatedBody.previewResolution !== undefined) {
      updateData.previewResolution = validatedBody.previewResolution
    }

    if (validatedBody.watermarkEnabled !== undefined) {
      updateData.watermarkEnabled = validatedBody.watermarkEnabled
    }

    if (validatedBody.watermarkText !== undefined) {
      // SECURITY: Validate watermark text (same rules as FFmpeg sanitization)
      // Only allow alphanumeric, spaces, and safe punctuation: - _ . ( )
      if (validatedBody.watermarkText) {
        const invalidChars = validatedBody.watermarkText.match(/[^a-zA-Z0-9\s\-_.()]/g)
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
        if (validatedBody.watermarkText.length > 100) {
          return NextResponse.json(
            {
              error: 'Watermark text too long',
              details: 'Watermark text must be 100 characters or less'
            },
            { status: 400 }
          )
        }
      }

      updateData.watermarkText = validatedBody.watermarkText || null
    }

    if (validatedBody.allowAssetDownload !== undefined) {
      updateData.allowAssetDownload = validatedBody.allowAssetDownload
    }

    // Handle password, authMode, and guest settings updates
    // Fetch current project once if any security field is being updated
    let passwordWasChanged = false
    let authModeWasChanged = false
    let guestModeWasChanged = false
    let guestLatestOnlyWasChanged = false

    if (validatedBody.sharePassword !== undefined || validatedBody.authMode !== undefined || validatedBody.guestMode !== undefined || validatedBody.guestLatestOnly !== undefined) {
      // Get current project state (single query for all security checks)
      const currentProject = await prisma.project.findUnique({
        where: { id },
        select: { authMode: true, sharePassword: true, guestMode: true, guestLatestOnly: true }
      })

      if (!currentProject) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      // Handle password update - only update if actually changed
      if (validatedBody.sharePassword !== undefined) {
        // Decrypt current password for comparison
        const currentPassword = currentProject.sharePassword ? decrypt(currentProject.sharePassword) : null

        // Only update if password actually changed
        if (validatedBody.sharePassword === null || validatedBody.sharePassword === '') {
          // Clearing password
          if (currentPassword !== null) {
            updateData.sharePassword = null
            passwordWasChanged = true
          }
        } else {
          // Setting/updating password - only if different from current
          if (validatedBody.sharePassword !== currentPassword) {
            updateData.sharePassword = encrypt(validatedBody.sharePassword)
            passwordWasChanged = true
          }
        }
      }

      // Handle authentication mode
      if (validatedBody.authMode !== undefined) {
        // Detect if authMode actually changed
        if (currentProject.authMode !== validatedBody.authMode) {
          authModeWasChanged = true
        }

        // Validate that password modes have a password when being set
        const newAuthMode = validatedBody.authMode
        const newPassword = validatedBody.sharePassword !== undefined ? validatedBody.sharePassword : undefined

        // Get current password if not being changed
        if (newPassword === undefined && (newAuthMode === 'PASSWORD' || newAuthMode === 'BOTH')) {
          const currentPassword = currentProject?.sharePassword ? decrypt(currentProject.sharePassword) : null

          if (!currentPassword) {
            return NextResponse.json(
              { error: 'Password authentication mode requires a password' },
              { status: 400 }
            )
          }
        } else if ((newAuthMode === 'PASSWORD' || newAuthMode === 'BOTH') && (!newPassword || newPassword === '')) {
          return NextResponse.json(
            { error: 'Password authentication mode requires a password' },
            { status: 400 }
          )
        }

        updateData.authMode = validatedBody.authMode
      }

      // Handle guest mode
      if (validatedBody.guestMode !== undefined) {
        // Detect if guestMode actually changed
        if (currentProject.guestMode !== validatedBody.guestMode) {
          guestModeWasChanged = true
        }
        updateData.guestMode = validatedBody.guestMode
      }

      // Handle guest latest only restriction
      if (validatedBody.guestLatestOnly !== undefined) {
        // Detect if guestLatestOnly actually changed
        if (currentProject.guestLatestOnly !== validatedBody.guestLatestOnly) {
          guestLatestOnlyWasChanged = true
        }
        updateData.guestLatestOnly = validatedBody.guestLatestOnly
      }
    }

    // Separate validation when only password is being cleared without authMode change
    if (validatedBody.sharePassword !== undefined && validatedBody.authMode === undefined) {
      const currentProject = await prisma.project.findUnique({
        where: { id },
        select: { authMode: true }
      })

      if ((currentProject?.authMode === 'PASSWORD' || currentProject?.authMode === 'BOTH') &&
          (validatedBody.sharePassword === null || validatedBody.sharePassword === '')) {
        return NextResponse.json(
          { error: 'Cannot remove password when using password authentication mode. Switch to "No Authentication" first.' },
          { status: 400 }
        )
      }
    }

    // Handle client notification schedule
    if (validatedBody.clientNotificationSchedule !== undefined) {
      updateData.clientNotificationSchedule = validatedBody.clientNotificationSchedule
    }
    if (validatedBody.clientNotificationTime !== undefined) {
      updateData.clientNotificationTime = validatedBody.clientNotificationTime
    }
    if (validatedBody.clientNotificationDay !== undefined) {
      updateData.clientNotificationDay = validatedBody.clientNotificationDay
    }

    // Update the project in database FIRST (before invalidating sessions)
    const project = await prisma.project.update({
      where: { id },
      data: updateData,
    })

    // SECURITY: After password, authMode, guestMode, or guestLatestOnly is updated in DB, invalidate ALL sessions for this project
    // This prevents clients from using old authentication/authorization even though security rules changed
    if (passwordWasChanged || authModeWasChanged || guestModeWasChanged || guestLatestOnlyWasChanged) {
      try {
        // Invalidate JWT-based share sessions
        const shareSessionsInvalidated = await invalidateShareTokensByProject(id)

        // Also invalidate any legacy Redis sessions
        const legacySessionsInvalidated = await invalidateProjectSessions(id)

        // Log the security action
        const changes: string[] = []
        if (passwordWasChanged) changes.push('password')
        if (authModeWasChanged) changes.push('auth mode')
        if (guestModeWasChanged) changes.push('guest mode')
        if (guestLatestOnlyWasChanged) changes.push('guest latest only')
        const changeReason = changes.join(' and ') + ' changed'

        console.log(
          `[SECURITY] Project ${changeReason} - invalidated ${shareSessionsInvalidated} share sessions ` +
          `and ${legacySessionsInvalidated} legacy sessions for project ${id}`
        )
      } catch (error) {
        console.error('[SECURITY] Failed to invalidate project sessions after security change:', error)
        // Don't fail the request if session invalidation fails - security change is more important
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

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'Too many project delete requests. Please slow down.',
  }, 'project-delete')
  if (rateLimitResult) return rateLimitResult

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
