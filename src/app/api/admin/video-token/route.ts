import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { generateVideoAccessToken } from '@/lib/video-access'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin Video Token Generation Endpoint
 *
 * Generates video access tokens for admin users to stream/download videos
 * Admins bypass normal share authentication but still need tokens for content delivery
 */
export async function GET(request: NextRequest) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: Allow generous limit for token generation
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 200,
    message: 'Too many token generation requests. Please slow down.'
  }, 'admin-video-token')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { searchParams } = new URL(request.url)
    const videoId = searchParams.get('videoId')
    const projectId = searchParams.get('projectId')
    const quality = searchParams.get('quality')
    const sessionId = searchParams.get('sessionId')

    if (!videoId || !projectId || !quality || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Verify video belongs to project
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, projectId: true }
    })

    if (!video || video.projectId !== projectId) {
      return NextResponse.json(
        { error: 'Video not found or does not belong to project' },
        { status: 404 }
      )
    }

    // Generate video access token
    const token = await generateVideoAccessToken(
      videoId,
      projectId,
      quality,
      request,
      sessionId
    )

    return NextResponse.json({ token })
  } catch (error) {
    console.error('[API] Failed to generate admin video token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
