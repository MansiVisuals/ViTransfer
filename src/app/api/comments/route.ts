import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { validateRequest, createCommentSchema } from '@/lib/validation'
import { getPrimaryRecipient } from '@/lib/recipients'
import { verifyProjectAccess } from '@/lib/project-access'
import { sanitizeComment } from '@/lib/comment-sanitization'
import {

  validateCommentPermissions,
  resolveCommentAuthor,
  sanitizeAndValidateContent,
  handleCommentNotifications,
  fetchProjectComments

} from '@/lib/comment-helpers'
export const runtime = 'nodejs'


// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/comments?projectId=xxx
 * Fetch all comments for a project
 */
export async function GET(request: NextRequest) {
  // Rate limiting: 60 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
  }, 'comments-read')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    // Fetch the project to check password protection
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        sharePassword: true,
        authMode: true,
        companyName: true,
        hideFeedback: true,
        guestMode: true,
      }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // SECURITY: If feedback is hidden, return empty array (don't expose comments)
    if (project.hideFeedback) {
      return NextResponse.json([])
    }

    // Verify project access using dual auth pattern
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode)

    if (!accessCheck.authorized) {
      return accessCheck.errorResponse!
    }

    const { isAdmin, isAuthenticated, isGuest } = accessCheck

    if (project.guestMode && isGuest) {
      return NextResponse.json([])
    }

    // Get primary recipient for author name fallback
    const primaryRecipient = await getPrimaryRecipient(projectId)
    // Priority: companyName → primary recipient → 'Client'
    const fallbackName = project.companyName || primaryRecipient?.name || 'Client'

    // Fetch all comments for the project
    const allComments = await prisma.comment.findMany({
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

    // Sanitize the response data
    const sanitizedComments = allComments.map((comment: any) =>
      sanitizeComment(
        comment,
        isAdmin,
        isAuthenticated,
        fallbackName,
      )
    )

    return NextResponse.json(sanitizedComments)
  } catch (error) {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting to prevent comment spam
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many comments. Please slow down.'
  }, 'comments-create')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const body = await request.json()

    // Note: Don't log body - may contain PII (emails)

    // Validate and sanitize input
    const validation = validateRequest(createCommentSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, details: validation.details },
        { status: 400 }
      )
    }

    const {
      projectId,
      videoId,
      videoVersion,
      timecode,
      content,
      authorName,
      authorEmail,
      recipientId,
      parentId,
      isInternal
    } = validation.data

    // Get authentication context (single call for both admin and share token)
    const authContext = await getAuthContext(request)

    // Validate comment permissions
    const permissionCheck = await validateCommentPermissions({
      projectId,
      isInternal: isInternal || false,
      currentUser: authContext.user
    })

    if (!permissionCheck.valid) {
      return NextResponse.json(
        { error: permissionCheck.error },
        { status: permissionCheck.errorStatus || 403 }
      )
    }

    // Get project for access verification
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        sharePassword: true,
        authMode: true,
      }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Verify project access using dual auth pattern
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode)

    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: 'Unable to process request' },
        { status: 400 }
      )
    }

    const { isAdmin, isAuthenticated } = accessCheck

    // Resolve author information
    const { authorEmail: finalAuthorEmail, fallbackName } = await resolveCommentAuthor({
      projectId,
      authorEmail,
      recipientId
    })

    // Sanitize and validate content
    const contentValidation = await sanitizeAndValidateContent({
      content,
      authorName
    })

    if (!contentValidation.valid) {
      return NextResponse.json(
        { error: contentValidation.error },
        { status: contentValidation.errorStatus || 400 }
      )
    }

    // Get video version if videoId is provided but version isn't
    let finalVideoVersion = videoVersion
    if (videoId && !videoVersion) {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { version: true }
      })
      if (video) {
        finalVideoVersion = video.version
      }
    }

    // Create comment in database
    const comment = await prisma.comment.create({
      data: {
        projectId,
        videoId,
        videoVersion: finalVideoVersion || null,
        timecode,
        content: contentValidation.sanitizedContent!,
        authorName: contentValidation.sanitizedAuthorName,
        authorEmail: finalAuthorEmail,
        isInternal: isInternal || false,
        parentId: parentId || null,
        userId: authContext.user?.id || null,
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
      }
    })

    // Handle notifications asynchronously
    await handleCommentNotifications({
      comment,
      projectId,
      videoId,
      parentId
    })

    // Fetch all comments for the project (to keep UI in sync)
    const allComments = await fetchProjectComments(projectId)

    // Sanitize the response data
    const sanitizedComments = allComments.map((comment: any) =>
      sanitizeComment(comment, isAdmin, isAuthenticated, fallbackName)
    )

    return NextResponse.json(sanitizedComments)
  } catch (error) {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
