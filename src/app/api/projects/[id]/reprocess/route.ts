import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { getVideoQueue } from '@/lib/queue'
import { deleteFile } from '@/lib/storage'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication - only admins can reprocess
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // CSRF protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  try {
    const { id: projectId } = await params
    const body = await request.json().catch(() => ({}))
    const { videoIds } = body

    // Get project with videos
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        videos: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Filter videos: only READY or ERROR status
    let videosToReprocess = project.videos.filter(
      video => video.status === 'READY' || video.status === 'ERROR'
    )

    // If videoIds array provided, filter to only those specific videos
    if (videoIds && Array.isArray(videoIds) && videoIds.length > 0) {
      videosToReprocess = videosToReprocess.filter(video => videoIds.includes(video.id))
    }

    if (videosToReprocess.length === 0) {
      return NextResponse.json({
        error: 'No videos available for reprocessing',
      }, { status: 400 })
    }

    const videoQueue = getVideoQueue()
    const reprocessed = []

    for (const video of videosToReprocess) {
      // Delete old preview files (keep original safe)
      const filesToDelete = [
        video.preview720Path,
        video.preview1080Path,
        video.thumbnailPath,
      ].filter(Boolean) as string[]

      await Promise.allSettled(
        filesToDelete.map(filePath => deleteFile(filePath))
      )

      // Reset video status and clear preview paths
      await prisma.video.update({
        where: { id: video.id },
        data: {
          status: 'PROCESSING',
          preview720Path: null,
          preview1080Path: null,
          thumbnailPath: null,
        },
      })

      // Re-queue video for processing
      await videoQueue.add('process-video', {
        videoId: video.id,
        originalStoragePath: video.originalStoragePath,
        projectId: project.id,
      })

      reprocessed.push({
        id: video.id,
        name: video.name,
        versionLabel: video.versionLabel,
      })
    }

    return NextResponse.json({
      success: true,
      count: reprocessed.length,
      videos: reprocessed,
    })
  } catch (error) {
    console.error('Error reprocessing videos:', error)
    return NextResponse.json(
      { error: 'Failed to reprocess videos' },
      { status: 500 }
    )
  }
}
