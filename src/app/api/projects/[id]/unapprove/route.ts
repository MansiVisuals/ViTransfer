import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: 20 unapproval actions per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'Too many requests. Please slow down.'
  }, 'admin-unapprove')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id: projectId } = await params

    // Get project details
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        videos: {
          select: { id: true, approved: true }
        }
      }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Unapprove ALL videos in the project
    await prisma.video.updateMany({
      where: { projectId },
      data: {
        approved: false,
        approvedAt: null
      }
    })

    // Unapprove the project
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'IN_REVIEW',
        approvedAt: null,
        approvedVideoId: null
      }
    })

    const approvedCount = project.videos.filter(v => v.approved).length

    return NextResponse.json({
      success: true,
      unapprovedCount: approvedCount
    })
  } catch (error) {
    console.error('Error unapproving project:', error)
    return NextResponse.json(
      { error: 'Failed to unapprove project' },
      { status: 500 }
    )
  }
}
