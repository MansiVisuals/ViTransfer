import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/project-access'
import { rateLimit } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import crypto from 'crypto'
import { z } from 'zod'

export const runtime = 'nodejs'

const downloadZipTokenSchema = z.object({
  assetIds: z.array(z.string().min(1)).min(1, 'No assets selected').max(50, 'Too many assets requested'),
})

/**
 * Generate a temporary download token for ZIP downloads
 * This allows using window.open() for non-blocking downloads
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params

  // Rate limit ZIP token generation
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many asset download requests. Please slow down.',
  }, `asset-zip-token:${videoId}`)
  if (rateLimitResult) return rateLimitResult

  try {
    // Parse request body for selected asset IDs
    const body = await request.json()
    const parsed = downloadZipTokenSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { assetIds } = parsed.data

    // Get video with project info
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { project: true },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const project = video.project

    // SECURITY: Verify user has access to this project (admin OR valid share session)
    const accessCheck = await verifyProjectAccess(
      request,
      project.id,
      project.sharePassword,
      project.authMode
    )

    if (!accessCheck.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // For non-admins, verify asset download settings and video approval
    if (!accessCheck.isAdmin) {
      if (!project.allowAssetDownload) {
        return NextResponse.json(
          { error: 'Asset downloads are not allowed for this project' },
          { status: 403 }
        )
      }

      if (!video.approved) {
        return NextResponse.json(
          { error: 'Assets are only available for approved videos' },
          { status: 403 }
        )
      }
    }

    // Verify all asset IDs belong to this video
    const assets = await prisma.videoAsset.findMany({
      where: {
        id: { in: assetIds },
        videoId,
      },
    })

    if (assets.length === 0) {
      return NextResponse.json({ error: 'No valid assets found' }, { status: 404 })
    }

    if (assets.length !== assetIds.length) {
      return NextResponse.json({ error: 'Some assets are invalid' }, { status: 400 })
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('base64url')

    // Store token in Redis with asset IDs and metadata (15 minute TTL)
    const redis = getRedis()
    const tokenData = {
      videoId,
      projectId: project.id,
      assetIds,
      sessionId: accessCheck.shareTokenSessionId || `guest:${Date.now()}`,
      createdAt: Date.now(),
    }

    await redis.setex(
      `zip_download:${token}`,
      15 * 60, // 15 minutes
      JSON.stringify(tokenData)
    )

    // Return download URL
    return NextResponse.json({
      url: `/api/content/zip/${token}`,
    })
  } catch (error) {
    console.error('ZIP download token generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate download link' },
      { status: 500 }
    )
  }
}
