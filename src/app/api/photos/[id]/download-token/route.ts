import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/project-access'
import { generateVideoAccessToken } from '@/lib/video-access'
import { logError } from '@/lib/logging'

// POST /api/photos/[id]/download-token - Generate temporary download token
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: photoId } = await params

    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { project: true },
    })

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Verify user has access to this project
    const accessCheck = await verifyProjectAccess(
      request,
      photo.project.id,
      photo.project.sharePassword,
      photo.project.authMode,
      {
        allowGuest: false,
        requiredPermission: 'download',
      }
    )

    if (!accessCheck.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Non-admins: check download permissions and approval
    if (!accessCheck.isAdmin) {
      if (!photo.project.allowAssetDownload) {
        return NextResponse.json(
          { error: 'Downloads are disabled for this project' },
          { status: 403 }
        )
      }

      if (!photo.approved) {
        return NextResponse.json(
          { error: 'Downloads available after approval' },
          { status: 403 }
        )
      }
    }

    // Generate access token (reuses video access token infrastructure)
    const sessionId = accessCheck.shareTokenSessionId || (accessCheck.isAdmin ? `admin:${Date.now()}` : `guest:${Date.now()}`)
    const token = await generateVideoAccessToken(
      photoId,
      photo.project.id,
      'original',
      request,
      sessionId
    )

    return NextResponse.json({
      url: `/api/content/${token}?download=true`,
    })
  } catch (error) {
    logError('Error generating photo download token:', error)
    return NextResponse.json({ error: 'Failed to generate download token' }, { status: 500 })
  }
}
