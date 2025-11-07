import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { validateRequest, updateCommentSchema } from '@/lib/validation'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { cookies } from 'next/headers'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * Sanitize comment data before sending to client
 * SECURITY-FIRST: Zero PII exposure policy
 */
function sanitizeComment(comment: any, isAdmin: boolean, isAuthenticated: boolean, clientName?: string) {
  const sanitized: any = {
    id: comment.id,
    projectId: comment.projectId,
    videoId: comment.videoId,
    videoVersion: comment.videoVersion,
    timestamp: comment.timestamp,
    content: comment.content,
    isInternal: comment.isInternal,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    parentId: comment.parentId,
  }

  if (isAdmin) {
    // Admins get real data for management
    sanitized.authorName = comment.authorName
    sanitized.authorEmail = comment.authorEmail
    sanitized.notifyByEmail = comment.notifyByEmail
    sanitized.notificationEmail = comment.notificationEmail
    sanitized.userId = comment.userId
    if (comment.user) {
      sanitized.user = {
        id: comment.user.id,
        name: comment.user.name,
        email: comment.user.email
      }
    }
  } else if (isAuthenticated && clientName) {
    // Authenticated users see client name (not PII like emails)
    sanitized.authorName = comment.isInternal ? 'Admin' : clientName
  } else {
    // Clients ONLY see generic labels - zero PII
    sanitized.authorName = comment.isInternal ? 'Admin' : 'Client'
  }

  // Recursively sanitize replies
  if (comment.replies && Array.isArray(comment.replies)) {
    sanitized.replies = comment.replies.map((reply: any) => sanitizeComment(reply, isAdmin, isAuthenticated, clientName))
  }

  return sanitized
}

// PATCH /api/comments/[id] - Update a comment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
            clientName: true
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

    // Check authentication for password-protected projects
    const currentUser = await getCurrentUserFromRequest(request)
    const isAdmin = currentUser?.role === 'ADMIN'
    let isAuthenticated = isAdmin

    if (existingComment.project.sharePassword && !isAdmin) {
      const cookieStore = await cookies()
      const authSessionId = cookieStore.get('share_auth')?.value

      if (!authSessionId) {
        return NextResponse.json(
          { error: 'Unable to process request' },
          { status: 400 }
        )
      }

      // Verify auth session maps to this project
      const redis = await import('@/lib/video-access').then(m => m.getRedis())
      const mappedProjectId = await redis.get(`auth_project:${authSessionId}`)

      if (mappedProjectId !== existingComment.project.id) {
        return NextResponse.json(
          { error: 'Unable to process request' },
          { status: 400 }
        )
      }

      // User has valid password authentication
      isAuthenticated = true
    }

    // Update the comment
    await prisma.comment.update({
      where: { id },
      data: {
        content,
        updatedAt: new Date(),
      },
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
    const sanitizedComments = allComments.map((comment: any) => sanitizeComment(comment, isAdmin, isAuthenticated, existingComment.project.clientName ?? undefined))

    return NextResponse.json(sanitizedComments)
  } catch (error) {
    console.error('Error updating comment:', error)
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}

// DELETE /api/comments/[id] - Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    // Get the comment to find its project and check if it has replies
    const existingComment = await prisma.comment.findUnique({
      where: { id },
      include: {
        replies: true,
        project: {
          select: {
            id: true,
            sharePassword: true,
            clientName: true
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

    // Check authentication for password-protected projects
    const currentUser = await getCurrentUserFromRequest(request)
    const isAdmin = currentUser?.role === 'ADMIN'
    let isAuthenticated = isAdmin

    if (existingComment.project.sharePassword && !isAdmin) {
      const cookieStore = await cookies()
      const authSessionId = cookieStore.get('share_auth')?.value

      if (!authSessionId) {
        return NextResponse.json(
          { error: 'Unable to process request' },
          { status: 400 }
        )
      }

      // Verify auth session maps to this project
      const redis = await import('@/lib/video-access').then(m => m.getRedis())
      const mappedProjectId = await redis.get(`auth_project:${authSessionId}`)

      if (mappedProjectId !== existingComment.project.id) {
        return NextResponse.json(
          { error: 'Unable to process request' },
          { status: 400 }
        )
      }

      // User has valid password authentication
      isAuthenticated = true
    }

    const projectId = existingComment.projectId

    // Delete the comment and its replies (cascade)
    await prisma.comment.delete({
      where: { id },
    })

    // Return all comments for the project (to keep UI in sync)
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

    // Sanitize response - never expose PII
    const sanitizedComments = allComments.map((comment: any) => sanitizeComment(comment, isAdmin, isAuthenticated, existingComment.project.clientName ?? undefined))

    return NextResponse.json(sanitizedComments)
  } catch (error) {
    console.error('Error deleting comment:', error)
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
