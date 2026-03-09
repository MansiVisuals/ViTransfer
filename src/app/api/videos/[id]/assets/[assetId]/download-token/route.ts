import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/project-access'
import { generateVideoAccessToken } from '@/lib/video-access'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'

/**
 * Generate a temporary download token for asset downloads (admins and share users)
 * This allows using window.open() without loading files into browser memory
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const locale = await getConfiguredLocale()
    const messages = await loadLocaleMessages(locale)
    const videoMessages = messages?.videos || {}

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
  return NextResponse.json({ error: messages?.share?.assetNotFound || 'Asset not found' }, { status: 404 })
    }

    const project = asset.video.project
    const isClientAsset = asset.uploadedBy === 'client'

    // Verify user has access to this project
    // Client-uploaded comment attachments only need 'comment' permission (view-level access)
    // Admin/regular assets need 'download' permission
    const accessCheck = await verifyProjectAccess(
      request,
      project.id,
      project.sharePassword,
      project.authMode,
      {
        allowGuest: false,
        requiredPermission: isClientAsset ? 'comment' : 'download',
      }
    )

    if (!accessCheck.authorized) {
  return NextResponse.json({ error: videoMessages.unauthorizedApi || 'Unauthorized' }, { status: 403 })
    }

    // Check download permissions for non-admins (non-client assets only)
    // Client-uploaded comment attachments bypass approval/download checks
    if (!accessCheck.isAdmin && !isClientAsset) {
      if (!project.allowAssetDownload) {
        return NextResponse.json(
          { error: videoMessages.assetDownloadsNotAllowedProject || 'Asset downloads are not allowed for this project' },
          { status: 403 }
        )
      }

      if (!asset.video.approved) {
        return NextResponse.json(
          { error: videoMessages.assetsApprovedOnly || 'Assets are only available for approved videos' },
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
    const locale = await getConfiguredLocale().catch(() => 'en')
    const messages = await loadLocaleMessages(locale).catch(() => null)
    const videoMessages = messages?.videos || {}
    return NextResponse.json(
      { error: videoMessages.failedToGenerateDownloadLink || 'Failed to generate download link' },
      { status: 500 }
    )
  }
}
