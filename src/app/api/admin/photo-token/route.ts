import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { generateVideoAccessToken } from '@/lib/video-access'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { logError } from '@/lib/logging'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin Photo Token Generation Endpoint
 *
 * Generates content access tokens for admin users to view/download photos
 * Reuses video access token infrastructure — content endpoint has photo fallback
 */
export async function GET(request: NextRequest) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 200,
    message: 'Too many token generation requests. Please slow down.'
  }, 'admin-photo-token')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { searchParams } = new URL(request.url)
    const photoId = searchParams.get('photoId')
    const projectId = searchParams.get('projectId')
    const sessionId = searchParams.get('sessionId')

    if (!photoId || !projectId || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Verify photo belongs to project
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      select: { id: true, projectId: true }
    })

    if (!photo || photo.projectId !== projectId) {
      return NextResponse.json(
        { error: 'Photo not found or does not belong to project' },
        { status: 404 }
      )
    }

    // Generate access token (reuses video token infra — content endpoint has photo fallback)
    const token = await generateVideoAccessToken(
      photoId,
      projectId,
      'original',
      request,
      sessionId
    )

    return NextResponse.json({ token })
  } catch (error) {
    logError('[API] Failed to generate admin photo token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
