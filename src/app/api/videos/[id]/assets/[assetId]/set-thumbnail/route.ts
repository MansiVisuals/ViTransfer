import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
export const runtime = 'nodejs'




// POST /api/videos/[id]/assets/[assetId]/set-thumbnail - Set asset as video thumbnail
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 3. RATE LIMITING
  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: 'Too many thumbnail update requests. Please slow down.',
    },
    'set-asset-thumbnail'
  )
  if (rateLimitResult) return rateLimitResult

  const { id: videoId, assetId } = await params

  try {
    // Get the action from request body (default to 'set')
    const body = await request.json()
    const action = body.action || 'set'

    // Verify video exists
    const video = await prisma.video.findUnique({
      where: { id: videoId },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // If action is 'remove', revert to system-generated thumbnail
    if (action === 'remove') {
      // System-generated thumbnail path: projects/{projectId}/videos/{videoId}/thumbnail.jpg
      const systemThumbnailPath = `projects/${video.projectId}/videos/${videoId}/thumbnail.jpg`

      await prisma.video.update({
        where: { id: videoId },
        data: {
          thumbnailPath: systemThumbnailPath,
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Reverted to system-generated thumbnail',
      })
    }

    // For 'set' action, verify asset and set it as thumbnail
    const asset = await prisma.videoAsset.findUnique({
      where: { id: assetId },
    })

    if (!asset || asset.videoId !== videoId) {
      return NextResponse.json(
        { error: 'Asset not found or does not belong to this video' },
        { status: 404 }
      )
    }

    // Verify asset is an image (fileType is now properly set after TUS upload)
    const imageTypes = ['image/jpeg', 'image/png', 'image/jpg']
    if (!imageTypes.includes(asset.fileType.toLowerCase())) {
      return NextResponse.json(
        { error: 'Only JPG and PNG images can be set as thumbnails' },
        { status: 400 }
      )
    }

    // Update video thumbnail path to point to this asset
    await prisma.video.update({
      where: { id: videoId },
      data: {
        thumbnailPath: asset.storagePath,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Thumbnail updated successfully',
    })
  } catch (error) {
    console.error('Error setting asset as thumbnail:', error)
    return NextResponse.json(
      { error: 'Failed to set thumbnail' },
      { status: 500 }
    )
  }
}
