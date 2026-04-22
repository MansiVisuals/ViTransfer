import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/project-access'
import { rateLimit } from '@/lib/rate-limit'
import { generateVideoAccessToken } from '@/lib/video-access'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

/**
 * Generate per-video download URLs for all approved videos.
 * Used by share page "Download All" button (batch individual downloads, no ZIP).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const shareMessages = messages?.share || {}

  const { token: slug } = await params

  // Rate limit
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 5,
    message: shareMessages.tooManyRequestsGeneric || 'Too many download requests. Please slow down.',
  }, `download-all-token:${slug}`)
  if (rateLimitResult) return rateLimitResult

  try {
    // Find project by slug
    const project = await prisma.project.findUnique({
      where: { slug },
      select: {
        id: true,
        sharePassword: true,
        authMode: true,
        allowAssetDownload: true,
        title: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: shareMessages.projectNotFound || 'Project not found' }, { status: 404 })
    }

    // Verify access (must have download permission, no guests)
    const accessCheck = await verifyProjectAccess(
      request,
      project.id,
      project.sharePassword,
      project.authMode,
      {
        allowGuest: false,
        requiredPermission: 'download',
      }
    )

    if (!accessCheck.authorized) {
      return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 403 })
    }

    // Non-admins need allowAssetDownload enabled
    if (!accessCheck.isAdmin && !project.allowAssetDownload) {
      return NextResponse.json(
        { error: shareMessages.downloadsDisabled || 'Downloads are disabled for this project' },
        { status: 403 }
      )
    }

    // Find all approved videos with latest version per name
    const approvedVideos = await prisma.video.findMany({
      where: {
        projectId: project.id,
        approved: true,
        status: { in: ['READY', 'PROCESSING'] },
      },
      select: {
        id: true,
        name: true,
        versionLabel: true,
        originalFileName: true,
        originalStoragePath: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (approvedVideos.length === 0) {
      return NextResponse.json(
        { error: shareMessages.noApprovedVideos || 'No approved videos available for download' },
        { status: 404 }
      )
    }

    const sessionId = accessCheck.shareTokenSessionId || (accessCheck.isAdmin ? `admin:${Date.now()}` : `guest:${Date.now()}`)

    const urls = await Promise.all(
      approvedVideos.map(async (video) => {
        const accessToken = await generateVideoAccessToken(
          video.id,
          project.id,
          'original',
          request,
          sessionId
        )
        return `/api/content/${accessToken}?download=true`
      })
    )

    return NextResponse.json({
      urls,
      videoCount: approvedVideos.length,
    })
  } catch (error) {
    logError('Bulk download token generation error:', error)
    return NextResponse.json(
      { error: shareMessages.downloadFailed || 'Failed to generate download link' },
      { status: 500 }
    )
  }
}
