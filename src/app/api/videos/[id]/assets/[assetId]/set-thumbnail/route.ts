import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'
import { rateLimit } from '@/lib/rate-limit'

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

  // 2. CSRF PROTECTION
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

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
    // Verify video exists
    const video = await prisma.video.findUnique({
      where: { id: videoId },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Verify asset exists and belongs to this video
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
