import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/project-access'
import { generateVideoAccessToken } from '@/lib/video-access'

/**
 * Generate a temporary download token for asset downloads (admins and share users)
 * This allows using window.open() without loading files into browser memory
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const { id: videoId, assetId } = await params

    // Get asset with video and project info
    const asset = await prisma.videoAsset.findUnique({
      where: { id: assetId },
      include: {
        video: {
          include: {
            project: true,
          },
        },
      },
    })

    if (!asset || asset.videoId !== videoId) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    const project = asset.video.project

    // Verify user has access to this project
    const accessCheck = await verifyProjectAccess(
      request,
      project.id,
      project.sharePassword,
      project.authMode
    )

    if (!accessCheck.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check download permissions for non-admins
    if (!accessCheck.isAdmin) {
      if (!project.allowAssetDownload) {
        return NextResponse.json(
          { error: 'Asset downloads are not allowed for this project' },
          { status: 403 }
        )
      }

      if (!asset.video.approved) {
        return NextResponse.json(
          { error: 'Assets are only available for approved videos' },
          { status: 403 }
        )
      }
    }

    // Generate video access token (we use video access tokens for assets too); tag admin sessions
    const sessionId = accessCheck.shareTokenSessionId || (accessCheck.isAdmin ? `admin:${Date.now()}` : `guest:${Date.now()}`)
    const token = await generateVideoAccessToken(
      videoId,
      project.id,
      'original',
      request,
      sessionId
    )

    // Return download URL with asset ID parameter
    return NextResponse.json({
      url: `/api/content/${token}?download=true&assetId=${assetId}`,
    })
  } catch (error) {
    console.error('Asset download token generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate download link' },
      { status: 500 }
    )
  }
}
