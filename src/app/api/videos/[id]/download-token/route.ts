import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/project-access'
import { generateVideoAccessToken } from '@/lib/video-access'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'


/**
 * Generate a temporary download token for video downloads (admins and share users)
 * This allows using window.open() without loading files into browser memory
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const videoMessages = messages?.videos || {}

  try {
    const { id: videoId } = await params

    // Get video with project info
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { project: true },
    })

    if (!video) {
      return NextResponse.json({ error: videoMessages.videoNotFoundApi || 'Video not found' }, { status: 404 })
    }

    // Verify user has access to this project
    const accessCheck = await verifyProjectAccess(
      request,
      video.project.id,
      video.project.sharePassword,
      video.project.authMode,
      {
        allowGuest: false,
        requiredPermission: 'download',
      }
    )

    if (!accessCheck.authorized) {
      return NextResponse.json({ error: videoMessages.unauthorizedApi || 'Unauthorized' }, { status: 403 })
    }

    // Check download permissions for non-admins
    if (!accessCheck.isAdmin) {
      if (!video.project.allowAssetDownload) {
        return NextResponse.json(
          { error: videoMessages.downloadsDisabledForProject || 'Downloads are disabled for this project' },
          { status: 403 }
        )
      }

      if (!video.approved) {
        return NextResponse.json(
          { error: videoMessages.downloadsAvailableAfterApproval || 'Downloads available after approval' },
          { status: 403 }
        )
      }
    }

    // Generate video access token; tag admin sessions to avoid analytics inflation
    const sessionId = accessCheck.shareTokenSessionId || (accessCheck.isAdmin ? `admin:${Date.now()}` : `guest:${Date.now()}`)
    const token = await generateVideoAccessToken(
      videoId,
      video.project.id,
      'original',
      request,
      sessionId
    )

    // Return download URL (uses /api/content endpoint with download flag)
    return NextResponse.json({
      url: `/api/content/${token}?download=true`,
    })
  } catch (error) {
    logError('Download token generation error:', error)
    return NextResponse.json(
      { error: videoMessages.failedToGenerateDownloadLink || 'Failed to generate download link' },
      { status: 500 }
    )
  }
}
