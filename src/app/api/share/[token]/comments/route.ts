import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPrimaryRecipient } from '@/lib/recipients'
import { rateLimit } from '@/lib/rate-limit'
import { verifyProjectAccess } from '@/lib/project-access'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * Sanitize comment data before sending to client
 * SECURITY: Zero PII exposure policy
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
    // Admins get real data
    sanitized.authorName = comment.authorName
    sanitized.authorEmail = comment.authorEmail
    sanitized.userId = comment.userId
  } else if (isAuthenticated) {
    // Authenticated users see the actual author name (custom or recipient name)
    sanitized.authorName = comment.isInternal ? 'Admin' : (comment.authorName || clientName || 'Client')
    // NO email fields at all for non-admins
  } else {
    // Non-authenticated users see generic labels only
    sanitized.authorName = comment.isInternal ? 'Admin' : 'Client'
    // NO email fields at all for non-admins
  }

  // Recursively sanitize replies
  if (comment.replies && Array.isArray(comment.replies)) {
    sanitized.replies = comment.replies.map((reply: any) => sanitizeComment(reply, isAdmin, isAuthenticated, clientName))
  }

  return sanitized
}

/**
 * GET /api/share/[token]/comments
 *
 * Load comments for a share page (token-based access)
 * Replaces direct project ID access for better security
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    // Rate limiting to prevent scraping
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: 'Too many requests. Please slow down.'
    }, `share-comments:${token}`)

    if (rateLimitResult) return rateLimitResult

    // Fetch project by token (not by ID - more secure)
    const project = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
        sharePassword: true,
      }
    })

    if (!project) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get primary recipient for author name
    const primaryRecipient = await getPrimaryRecipient(project.id)
    const fallbackName = primaryRecipient?.name || 'Client'

    // Verify project access using dual auth pattern (admin JWT or share_auth cookie)
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword)

    if (!accessCheck.authorized) {
      return accessCheck.errorResponse!
    }

    const { isAdmin, isAuthenticated } = accessCheck

    // Fetch comments with nested replies
    const comments = await prisma.comment.findMany({
      where: {
        projectId: project.id,
        parentId: null, // Only top-level comments
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

    // Sanitize comments - never expose PII to non-admins
    const sanitizedComments = comments.map((comment: any) => sanitizeComment(comment, isAdmin, isAuthenticated, fallbackName))

    return NextResponse.json(sanitizedComments)
  } catch (error) {
    console.error('Error fetching comments:', error)
    return NextResponse.json({ error: 'Unable to process request' }, { status: 500 })
  }
}
