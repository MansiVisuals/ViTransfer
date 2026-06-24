import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteFile, deleteDirectory } from '@/lib/storage'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt, decrypt } from '@/lib/encryption'
import { isSmtpConfigured } from '@/lib/settings'
import { flushPendingClientNotifications } from '@/lib/notifications'
import { invalidateShareTokensByProject } from '@/lib/session-invalidation'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeComment } from '@/lib/comment-sanitization'
import { updateProjectSchema } from '@/lib/validation'
import { syncCompanyToDirectory } from '@/lib/client-directory-sync'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError, logMessage } from '@/lib/logging'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const projectMessages = messages?.projects || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: 60 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: projectMessages.tooManyRequestsGeneric || 'Too many requests. Please slow down.'
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
      return NextResponse.json({ error: projectMessages.projectNotFoundApi || 'Project not found' }, { status: 404 })
    }

    // Check SMTP configuration status
    const smtpConfigured = await isSmtpConfigured()

    const primaryRecipient = project.recipients?.find((r: any) => r.isPrimary) || project.recipients?.[0]
    const fallbackName = project.companyName || primaryRecipient?.name || 'Client'

    const sanitizedComments = project.comments.map((comment: any) =>
      sanitizeComment(comment, true, true, fallbackName)
    )

    // Decrypt password for admin view
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
      { error: projectMessages.unableToProcessRequest || 'Unable to process request' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const projectMessages = messages?.projects || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: mutation throttle
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: projectMessages.tooManyProjectUpdateRequests || 'Too many project update requests. Please slow down.',
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

    const updateData: any = {}

    if (validatedBody.title !== undefined) {
      updateData.title = validatedBody.title
    }
    if (validatedBody.slug !== undefined) {
      const existingProject = await prisma.project.findFirst({
        where: {
          slug: validatedBody.slug,
          NOT: { id }
        }
      })
      
      if (existingProject) {
        return NextResponse.json(
          { error: projectMessages.shareLinkAlreadyInUse || 'This share link is already in use. Please choose a different one.' },
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
          { error: projectMessages.companyNameCannotContainLineBreaks || 'Company name cannot contain line breaks' },
          { status: 400 }
        )
      }
      updateData.companyName = validatedBody.companyName || null
    }

    if (validatedBody.clientCompanyId !== undefined) {
      updateData.clientCompanyId = validatedBody.clientCompanyId || null
    }

    if (validatedBody.status !== undefined) {
      updateData.status = validatedBody.status

      if (validatedBody.status === 'APPROVED') {
        updateData.approvedAt = new Date()
      }

      // When changing status away from APPROVED, clear approval metadata
      if (validatedBody.status !== 'APPROVED') {
        updateData.approvedAt = null
      }
    }

    if (validatedBody.enableRevisions !== undefined) {
      updateData.enableRevisions = validatedBody.enableRevisions
    }
    if (validatedBody.maxRevisions !== undefined) {
      updateData.maxRevisions = validatedBody.maxRevisions
    }

    if (validatedBody.restrictCommentsToLatestVersion !== undefined) {
      updateData.restrictCommentsToLatestVersion = validatedBody.restrictCommentsToLatestVersion
    }
    if (validatedBody.hideFeedback !== undefined) {
      updateData.hideFeedback = validatedBody.hideFeedback
    }
    if (validatedBody.timestampDisplay !== undefined) {
      updateData.timestampDisplay = validatedBody.timestampDisplay
    }

    if (validatedBody.previewResolution !== undefined) {
      updateData.previewResolution = validatedBody.previewResolution
    }

    if (validatedBody.skipTranscoding !== undefined) {
      updateData.skipTranscoding = validatedBody.skipTranscoding
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
              error: projectMessages.invalidWatermarkCharacters || 'Invalid characters in watermark text',
              details: (projectMessages.invalidWatermarkCharactersDetails || 'Watermark text contains invalid characters: {chars}. Only letters, numbers, spaces, and these characters are allowed: - _ . ( )').replace('{chars}', uniqueInvalid)
            },
            { status: 400 }
          )
        }

        if (validatedBody.watermarkText.length > 100) {
          return NextResponse.json(
            {
              error: projectMessages.watermarkTextTooLong || 'Watermark text too long',
              details: projectMessages.watermarkTextTooLongDetails || 'Watermark text must be 100 characters or less'
            },
            { status: 400 }
          )
        }
      }

      updateData.watermarkText = validatedBody.watermarkText || null
    }

    if (validatedBody.watermarkPositions !== undefined) {
      updateData.watermarkPositions = validatedBody.watermarkPositions
    }

    if (validatedBody.watermarkOpacity !== undefined) {
      updateData.watermarkOpacity = validatedBody.watermarkOpacity
    }

    if (validatedBody.watermarkFontSize !== undefined) {
      updateData.watermarkFontSize = validatedBody.watermarkFontSize
    }

    if (validatedBody.applyPreviewLut !== undefined) {
      updateData.applyPreviewLut = validatedBody.applyPreviewLut
    }

    if (validatedBody.allowAssetDownload !== undefined) {
      updateData.allowAssetDownload = validatedBody.allowAssetDownload
    }

    if (validatedBody.allowClientAssetUpload !== undefined) {
      updateData.allowClientAssetUpload = validatedBody.allowClientAssetUpload
    }

    if (validatedBody.allowReverseShare !== undefined) {
      updateData.allowReverseShare = validatedBody.allowReverseShare
    }

    if (validatedBody.clientCanApprove !== undefined) {
      updateData.clientCanApprove = validatedBody.clientCanApprove
    }

    // Handle approved playback setting
    if (validatedBody.usePreviewForApprovedPlayback !== undefined) {
      updateData.usePreviewForApprovedPlayback = validatedBody.usePreviewForApprovedPlayback
    }

    if (validatedBody.showClientTutorial !== undefined) {
      updateData.showClientTutorial = validatedBody.showClientTutorial
    }

    let passwordWasChanged = false
    let authModeWasChanged = false
    let guestModeWasChanged = false
    let guestLatestOnlyWasChanged = false

    if (validatedBody.sharePassword !== undefined || validatedBody.authMode !== undefined || validatedBody.guestMode !== undefined || validatedBody.guestLatestOnly !== undefined) {
      const currentProject = await prisma.project.findUnique({
        where: { id },
        select: { authMode: true, sharePassword: true, guestMode: true, guestLatestOnly: true }
      })

      if (!currentProject) {
        return NextResponse.json({ error: projectMessages.projectNotFoundApi || 'Project not found' }, { status: 404 })
      }

      if (validatedBody.sharePassword !== undefined) {
        const currentPassword = currentProject.sharePassword ? decrypt(currentProject.sharePassword) : null

        if (validatedBody.sharePassword === null || validatedBody.sharePassword === '') {
          if (currentPassword !== null) {
            updateData.sharePassword = null
            passwordWasChanged = true
          }
        } else {
          if (validatedBody.sharePassword !== currentPassword) {
            updateData.sharePassword = encrypt(validatedBody.sharePassword)
            passwordWasChanged = true
          }
        }
      }

      if (validatedBody.authMode !== undefined) {
        if (currentProject.authMode !== validatedBody.authMode) {
          authModeWasChanged = true
        }

        const newAuthMode = validatedBody.authMode
        const newPassword = validatedBody.sharePassword !== undefined ? validatedBody.sharePassword : undefined

        if (newPassword === undefined && (newAuthMode === 'PASSWORD' || newAuthMode === 'BOTH')) {
          const currentPassword = currentProject?.sharePassword ? decrypt(currentProject.sharePassword) : null

          if (!currentPassword) {
            return NextResponse.json(
                { error: projectMessages.passwordAuthRequiresPassword || 'Password authentication mode requires a password' },
              { status: 400 }
            )
          }
        } else if ((newAuthMode === 'PASSWORD' || newAuthMode === 'BOTH') && (!newPassword || newPassword === '')) {
          return NextResponse.json(
              { error: projectMessages.passwordAuthRequiresPassword || 'Password authentication mode requires a password' },
            { status: 400 }
          )
        }

        updateData.authMode = validatedBody.authMode
      }

      if (validatedBody.guestMode !== undefined) {
        if (currentProject.guestMode !== validatedBody.guestMode) {
          guestModeWasChanged = true
        }
        updateData.guestMode = validatedBody.guestMode
      }

      if (validatedBody.guestLatestOnly !== undefined) {
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
          { error: projectMessages.cannotRemovePasswordWhilePasswordAuth || 'Cannot remove password when using password authentication mode. Switch to "No Authentication" first.' },
          { status: 400 }
        )
      }
    }

    if (validatedBody.dueDate !== undefined) {
      updateData.dueDate = validatedBody.dueDate ? new Date(validatedBody.dueDate) : null
    }
    if (validatedBody.dueReminder !== undefined) {
      updateData.dueReminder = validatedBody.dueReminder
    }

    let previousClientSchedule: string | null = null
    if (validatedBody.clientNotificationSchedule !== undefined) {
      const current = await prisma.project.findUnique({
        where: { id },
        select: { clientNotificationSchedule: true }
      })
      previousClientSchedule = current?.clientNotificationSchedule || null
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

    // Flush pending client notifications when schedule changes
    if (previousClientSchedule !== null && validatedBody.clientNotificationSchedule !== previousClientSchedule) {
      logMessage(`[PROJECT] Client notification schedule changed for "${project.title}": ${previousClientSchedule} → ${validatedBody.clientNotificationSchedule}`)
      // Fire-and-forget: don't block the response
      void flushPendingClientNotifications(id).catch((error) => {
        logError('[PROJECT] Failed to flush pending client notifications after schedule change:', error)
      })
    }

    // SECURITY: After password, authMode, guestMode, or guestLatestOnly is updated in DB, invalidate ALL sessions for this project
    // This prevents clients from using old authentication/authorization even though security rules changed
    if (passwordWasChanged || authModeWasChanged || guestModeWasChanged || guestLatestOnlyWasChanged) {
      try {
        // Invalidate JWT-based share sessions
        const shareSessionsInvalidated = await invalidateShareTokensByProject(id)

        const changes: string[] = []
        if (passwordWasChanged) changes.push('password')
        if (authModeWasChanged) changes.push('auth mode')
        if (guestModeWasChanged) changes.push('guest mode')
        if (guestLatestOnlyWasChanged) changes.push('guest latest only')
        const changeReason = changes.join(' and ') + ' changed'

        logMessage(
          `[SECURITY] Project ${changeReason} - invalidated ${shareSessionsInvalidated} share sessions for project ${id}`
        )
      } catch (error) {
        logError('[SECURITY] Failed to invalidate project sessions after security change:', error)
        // Don't fail the request if session invalidation fails - security change is more important
      }

    }

    if (validatedBody.companyName && updateData.companyName) {
      syncCompanyToDirectory(id, updateData.companyName).catch(err => {
        logError('Failed to sync company to client directory:', err)
      })
    }

    return NextResponse.json(project)
  } catch (error) {
    return NextResponse.json(
      { error: projectMessages.operationFailed || 'Operation failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const projectMessages = messages?.projects || {}

  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: projectMessages.tooManyProjectDeleteRequests || 'Too many project delete requests. Please slow down.',
  }, 'project-delete')
  if (rateLimitResult) return rateLimitResult

  try {
    const { id } = await params
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        videos: { include: { assets: true } },
        projectUploads: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: projectMessages.projectNotFoundApi || 'Project not found' }, { status: 404 })
    }

    // Collect every stored file referenced by this project's videos, their
    // assets, and reverse-share uploads. Deleting each explicitly (rather than
    // relying solely on the directory sweep below) ensures files are removed
    // even when the recursive/prefix delete can't run — e.g. S3 without
    // ListBucket, or a flaky network-backed mount.
    const filePaths: (string | null)[] = []
    for (const video of project.videos) {
      filePaths.push(
        video.originalStoragePath,
        video.preview2160Path,
        video.preview1080Path,
        video.preview720Path,
        video.cleanPreview2160Path,
        video.cleanPreview1080Path,
        video.cleanPreview720Path,
        video.thumbnailPath,
        ...video.assets.map((asset) => asset.storagePath),
      )
    }
    filePaths.push(...project.projectUploads.map((upload) => upload.storagePath))

    for (const filePath of filePaths) {
      if (!filePath) continue
      try {
        await deleteFile(filePath)
      } catch (error) {
        logError(`Failed to delete file ${filePath} for project ${id}:`, error)
        // Continue deleting remaining files even if one fails
      }
    }

    // Final sweep: remove the project directory and any stray/empty folders.
    try {
      await deleteDirectory(`projects/${id}`)
    } catch (error) {
      logError(`Failed to delete project directory for ${id}:`, error)
      // Continue even if directory deletion fails
    }

    // SECURITY: Invalidate all share sessions for this project before deletion
    try {
      const invalidatedCount = await invalidateShareTokensByProject(id)
      logMessage(`[SECURITY] Project deleted - invalidated ${invalidatedCount} share sessions`)
    } catch (error) {
      logError('[SECURITY] Failed to invalidate sessions during project deletion:', error)
      // Continue with deletion even if session invalidation fails
    }

    // Delete project and all related data (cascade will handle videos, comments, shares)
    await prisma.project.delete({
      where: { id: id },
    })

    return NextResponse.json({
      success: true,
      message: projectMessages.projectDeletedSuccessfully || 'Project and all related files deleted successfully'
    })
  } catch (error) {
    return NextResponse.json(
      { error: projectMessages.operationFailed || 'Operation failed' },
      { status: 500 }
    )
  }
}
