import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { downloadFile, sanitizeFilenameForHeader } from '@/lib/storage'
import { verifyProjectAccess } from '@/lib/project-access'
import archiver from 'archiver'
import { Readable } from 'stream'

// POST /api/videos/[id]/assets/download-zip - Download selected assets as zip
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params

  // Rate limiting
  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 10,
      message: 'Too many download requests. Please slow down.',
    },
    'video-assets-zip-download'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    // Parse request body for selected asset IDs
    const body = await request.json()
    const { assetIds } = body

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { error: 'No assets selected for download' },
        { status: 400 }
      )
    }

    // Get video with project info
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        project: true,
      },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const project = video.project

    // SECURITY: Verify user has access to this project (admin OR valid share session)
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword)
    if (!accessCheck.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // For non-admins, verify asset download settings and video approval
    if (!accessCheck.isAdmin) {
      // Check if project allows asset downloads
      if (!project.allowAssetDownload) {
        return NextResponse.json(
          { error: 'Asset downloads are not allowed for this project' },
          { status: 403 }
        )
      }

      // Check if video is approved (assets only available for approved videos)
      if (!video.approved) {
        return NextResponse.json(
          { error: 'Assets are only available for approved videos' },
          { status: 403 }
        )
      }
    }

    // Get all requested assets
    const assets = await prisma.videoAsset.findMany({
      where: {
        id: { in: assetIds },
        videoId,
      },
    })

    if (assets.length === 0) {
      return NextResponse.json({ error: 'No valid assets found' }, { status: 404 })
    }

    // Create zip archive
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Compression level
    })

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err)
      throw err
    })

    // Add files to archive
    for (const asset of assets) {
      try {
        const fileStream = await downloadFile(asset.storagePath)
        archive.append(fileStream, { name: asset.fileName })
      } catch (error) {
        console.error(`Error adding file ${asset.fileName} to archive:`, error)
        // Continue with other files
      }
    }

    // Finalize archive
    archive.finalize()

    // Create readable stream from archive
    const readableStream = Readable.toWeb(archive as any) as ReadableStream

    // Generate zip filename
    const sanitizedVideoName = video.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const zipFilename = sanitizeFilenameForHeader(
      `${sanitizedVideoName}_${video.versionLabel}_assets.zip`
    )

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
      },
    })
  } catch (error) {
    console.error('Error creating asset zip:', error)
    return NextResponse.json(
      { error: 'Failed to create asset archive' },
      { status: 500 }
    )
  }
}
