import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'
import { rateLimit } from '@/lib/rate-limit'
import { logSecurityEvent } from '@/lib/video-access'

/**
 * GET /api/projects/[id]/password
 *
 * Retrieve decrypted share password for a project
 *
 * Security Features:
 * - Admin authentication required
 * - Rate limiting: 10 requests/hour per user
 * - Security event logging
 * - Separate endpoint to minimize exposure
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }
  const admin = authResult

  // Strict rate limiting: 10 requests per hour
  // Prevents brute force attempts and excessive password exposure
  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 10,
      message: 'Too many password requests. Please try again later.',
    },
    `password-decrypt-${admin.id}`
  )

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id } = await params

    // Fetch project
    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        sharePassword: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Log security event
    await logSecurityEvent({
      type: 'PASSWORD_ACCESS',
      severity: 'INFO',
      projectId: project.id,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      details: {
        userId: admin.id,
        projectTitle: project.title,
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
    })

    // Decrypt password
    const decryptedPassword = project.sharePassword ? decrypt(project.sharePassword) : null

    return NextResponse.json({
      password: decryptedPassword,
    })
  } catch (error) {
    console.error('Error retrieving project password:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve password' },
      { status: 500 }
    )
  }
}
