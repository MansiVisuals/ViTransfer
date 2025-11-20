import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { getPrimaryRecipient } from '@/lib/recipients'
import { verifyProjectAccess } from '@/lib/project-access'
import { isSmtpConfigured } from '@/lib/settings'

/**
 * Validate comment permissions
 * Checks if user can create comments based on project settings
 */
export async function validateCommentPermissions(params: {
  projectId: string
  isInternal: boolean
  currentUser: any
}): Promise<{ valid: boolean; error?: string; errorStatus?: number }> {
  const { projectId, isInternal, currentUser } = params

  // SECURITY: If isInternal flag is set, verify admin session
  if (isInternal) {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { valid: false, error: 'Unauthorized', errorStatus: 401 }
    }
  }

  // Fetch the project to check permissions
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      sharePassword: true,
      authMode: true,
      hideFeedback: true,
      guestMode: true,
    }
  })

  if (!project) {
    return { valid: false, error: 'Access denied', errorStatus: 403 }
  }

  // SECURITY: If feedback is hidden, reject comment creation
  if (project.hideFeedback) {
    return { valid: false, error: 'Comments are disabled for this project', errorStatus: 403 }
  }

  // SECURITY: Block guest comment creation (guests should only view videos)
  if (project.guestMode) {
    const { cookies } = await import('next/headers')
    const { getRedis } = await import('@/lib/redis')
    const cookieStore = await cookies()
    const sessionId = cookieStore.get('share_session')?.value

    if (sessionId) {
      const redis = await getRedis()
      const isGuestSession = await redis.exists(`guest_session:${sessionId}`)

      if (isGuestSession === 1) {
        return { valid: false, error: 'Comments are disabled for guest users', errorStatus: 403 }
      }
    }
  }

  return { valid: true }
}

/**
 * Resolve comment author information
 * Determines author email and fallback name based on user type
 */
export async function resolveCommentAuthor(params: {
  projectId: string
  authorEmail?: string | null | undefined
  recipientId?: string | null | undefined
}): Promise<{ authorEmail: string | null; fallbackName: string }> {
  const { projectId, authorEmail, recipientId } = params

  // Get primary recipient for author name fallback
  const primaryRecipient = await getPrimaryRecipient(projectId)

  // Get project company name
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { companyName: true }
  })

  // Priority: companyName → primary recipient → 'Client'
  const fallbackName = project?.companyName || primaryRecipient?.name || 'Client'

  // If recipientId provided, use that recipient's email
  let finalAuthorEmail = authorEmail || null

  if (recipientId) {
    const recipient = await prisma.projectRecipient.findUnique({
      where: { id: recipientId },
      select: { email: true, projectId: true }
    })

    if (recipient && recipient.projectId === projectId) {
      finalAuthorEmail = recipient.email
    }
  }

  return { authorEmail: finalAuthorEmail, fallbackName }
}

/**
 * Sanitize and validate comment content and author name
 */
export async function sanitizeAndValidateContent(params: {
  content: string
  authorName?: string | null | undefined
}): Promise<{
  valid: boolean
  sanitizedContent?: string
  sanitizedAuthorName?: string | null
  error?: string
  errorStatus?: number
}> {
  const { content, authorName } = params

  const { validateCommentLength, containsSuspiciousPatterns, sanitizeCommentHtml } =
    await import('@/lib/security/html-sanitization')

  // Validate content length
  if (!validateCommentLength(content)) {
    return {
      valid: false,
      error: 'Comment is too long (max 10,000 characters)',
      errorStatus: 400
    }
  }

  // Check for suspicious patterns
  if (containsSuspiciousPatterns(content)) {
    return {
      valid: false,
      error: 'Comment contains potentially malicious content',
      errorStatus: 400
    }
  }

  // Sanitize HTML content
  const sanitizedContent = sanitizeCommentHtml(content)

  // Sanitize authorName (same rules as watermark text)
  let sanitizedAuthorName = authorName || null
  if (sanitizedAuthorName) {
    // Remove invalid characters
    const invalidChars = sanitizedAuthorName.match(/[^a-zA-Z0-9\s\-_.()]/g)
    if (invalidChars) {
      return {
        valid: false,
        error: 'Invalid characters in name',
        errorStatus: 400
      }
    }

    // Length check
    if (sanitizedAuthorName.length > 50) {
      return {
        valid: false,
        error: 'Name is too long (max 50 characters)',
        errorStatus: 400
      }
    }

    // Trim whitespace
    sanitizedAuthorName = sanitizedAuthorName.trim()
  }

  return {
    valid: true,
    sanitizedContent,
    sanitizedAuthorName
  }
}

/**
 * Handle comment notifications
 * Sends notifications immediately or queues them based on schedule
 */
export async function handleCommentNotifications(params: {
  comment: any
  projectId: string
  videoId?: string
  parentId?: string
}): Promise<void> {
  const { comment, projectId, videoId, parentId } = params

  try {
    // Check if SMTP is configured
    const smtpConfigured = await isSmtpConfigured()
    console.log('[COMMENT-NOTIFICATION] SMTP configured:', smtpConfigured)

    if (!smtpConfigured) {
      console.log('[COMMENT-NOTIFICATION] Skipping - SMTP not configured')
      return
    }

    // Get project with notification schedule
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        slug: true,
        clientNotificationSchedule: true,
      }
    })

    if (!project) {
      console.log('[COMMENT-NOTIFICATION] Project not found')
      return
    }

    // Get video info
    const video = videoId ? await prisma.video.findUnique({
      where: { id: videoId },
      select: { name: true, versionLabel: true }
    }) : null

    console.log('[COMMENT-NOTIFICATION] Video:', video?.name || 'None')

    // Get settings for admin schedule
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { adminNotificationSchedule: true }
    })

    // Determine which schedule to use
    const isAdminComment = comment.isInternal
    const schedule = isAdminComment
      ? project.clientNotificationSchedule // Admin replies use client schedule
      : (settings?.adminNotificationSchedule || 'IMMEDIATE') // Client comments use admin schedule

    console.log(`[COMMENT-NOTIFICATION] Comment type: ${isAdminComment ? 'ADMIN' : 'CLIENT'}, Schedule: ${schedule}`)

    const context = {
      comment,
      project: { id: project.id, title: project.title, slug: project.slug },
      video,
      isReply: !!parentId
    }

    // Handle notification based on schedule
    if (schedule === 'IMMEDIATE') {
      console.log('[COMMENT-NOTIFICATION] Sending immediately...')
      const { sendImmediateNotification } = await import('@/lib/notifications')
      await sendImmediateNotification(context)
    } else {
      console.log(`[COMMENT-NOTIFICATION] Queuing for later (${schedule})...`)
      const { queueNotification } = await import('@/lib/notifications')
      await queueNotification(context)
    }
  } catch (emailError) {
    // Don't fail the request if notification processing fails
    console.error('[COMMENT-NOTIFICATION] Error processing notification:', emailError)
  }
}

/**
 * Fetch all comments for a project
 * Returns top-level comments with nested replies
 */
export async function fetchProjectComments(projectId: string) {
  return prisma.comment.findMany({
    where: {
      projectId,
      parentId: null, // Only get top-level comments
    },
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
        orderBy: { createdAt: 'asc' }
      }
    },
    orderBy: { createdAt: 'asc' }
  })
}
