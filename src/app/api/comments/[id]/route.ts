import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { validateRequest, updateCommentSchema } from '@/lib/validation'
import { requireApiAdmin } from '@/lib/auth'
import { verifyProjectAccess } from '@/lib/project-access'
import { sanitizeComment } from '@/lib/comment-sanitization'
import { sanitizeCommentHtml } from '@/lib/security/html-sanitization'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'
import { cookies } from 'next/headers'
import { getRedis } from '@/lib/redis'
export const runtime = 'nodejs'




// Prevent static generation for this route
export const dynamic = 'force-dynamic'

// PATCH /api/comments/[id] - Update a comment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // CSRF protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  // Rate limiting to prevent abuse
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'Too many requests. Please slow down.'
  }, 'comments-update')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id } = await params
    const body = await request.json()

    // Validate input
    const validation = validateRequest(updateCommentSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, details: validation.details },
        { status: 400 }
      )
    }

    const { content } = validation.data

    // Get the comment to find its project
    const existingComment = await prisma.comment.findUnique({
      where: { id },
      select: {
        projectId: true,
        project: {
          select: {
            id: true,
            sharePassword: true,
            authMode: true,
            companyName: true,
            hideFeedback: true,
            guestMode: true,
            recipients: {
              where: { isPrimary: true },
              take: 1,
              select: {
                name: true,
              }
            }
          }
        }
      }
    })

    if (!existingComment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      )
    }

    // SECURITY: If feedback is hidden, reject comment updates
    if (existingComment.project.hideFeedback) {
      return NextResponse.json(
        { error: 'Comments are disabled for this project' },
        { status: 403 }
      )
    }

    // SECURITY: Block guest comment updates (guests should only view videos)
    if (existingComment.project.guestMode) {
      const cookieStore = await cookies()
      const sessionId = cookieStore.get('share_session')?.value

      if (sessionId) {
        const redis = await getRedis()
        const isGuestSession = await redis.exists(`guest_session:${sessionId}`)

        if (isGuestSession === 1) {
          return NextResponse.json(
            { error: 'Comments are disabled for guest users' },
            { status: 403 }
          )
        }
      }
    }

    // Verify project access using dual auth pattern
    const accessCheck = await verifyProjectAccess(
      request,
      existingComment.project.id,
      existingComment.project.sharePassword,
      existingComment.project.authMode
    )

    if (!accessCheck.authorized) {
      // Don't reveal if comment exists - return generic error
      return NextResponse.json(
        { error: 'Unable to process request' },
        { status: 400 }
      )
    }

    const { isAdmin, isAuthenticated } = accessCheck

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
    }

    // SECURITY: Sanitize comment HTML before updating if content is provided (O-7 fix)
    if (content !== undefined) {
      updateData.content = sanitizeCommentHtml(content)
    }

    // Update the comment
    await prisma.comment.update({
      where: { id },
      data: updateData,
    })

    // Return all comments for the project (to keep UI in sync)
    const allComments = await prisma.comment.findMany({
      where: {
        projectId: existingComment.projectId,
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

    // Sanitize response - never expose PII
    // Priority: companyName → primary recipient → undefined
    const primaryRecipientName = existingComment.project.companyName || existingComment.project.recipients[0]?.name || undefined
    const sanitizedComments = allComments.map((comment: any) => sanitizeComment(comment, isAdmin, isAuthenticated, primaryRecipientName))

    return NextResponse.json(sanitizedComments)
  } catch (error) {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}

// DELETE /api/comments/[id] - Delete a comment (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authentication - admin only
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // CSRF protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  // Rate limiting to prevent abuse
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'Too many requests. Please slow down.'
  }, 'comments-delete')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id } = await params

    // Get the comment to find its project
    const existingComment = await prisma.comment.findUnique({
      where: { id },
      select: {
        projectId: true,
        project: {
          select: {
            id: true,
            recipients: {
              where: { isPrimary: true },
              take: 1,
              select: {
                name: true,
              }
            }
          }
        }
      }
    })

    if (!existingComment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      )
    }

    const projectId = existingComment.projectId

    // Delete the comment and its replies (cascade)
    await prisma.comment.delete({
      where: { id },
    })

    // Return success - client will refresh to get updated comments
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
  }
}
