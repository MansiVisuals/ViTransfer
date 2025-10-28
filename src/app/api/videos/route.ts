import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }
  const admin = authResult

  try {
    const body = await request.json()
    const { projectId, versionLabel, originalFileName, originalFileSize, name } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Video name is required' }, { status: 400 })
    }

    const videoName = name.trim()

    // Get the project and existing videos with the same name
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        videos: {
          where: { name: videoName },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Calculate next version number for this specific video name
    const nextVersion = project.videos.length > 0 ? project.videos[0].version + 1 : 1

    // Check if revisions are enabled and validate
    if (project.enableRevisions && project.maxRevisions > 0) {
      // First upload (version 1) doesn't count as a revision
      // currentRevision tracks actual changes after the first upload
      const actualRevisionNumber = nextVersion - 1 // 0 for first, 1 for second, etc.

      if (actualRevisionNumber > project.maxRevisions) {
        return NextResponse.json(
          { error: `Maximum revisions (${project.maxRevisions}) exceeded` },
          { status: 400 }
        )
      }
    }

    // Create video record
    const video = await prisma.video.create({
      data: {
        projectId,
        name: videoName,
        version: nextVersion,
        versionLabel: versionLabel || `v${nextVersion}`,
        originalFileName,
        originalFileSize: BigInt(originalFileSize),
        originalStoragePath: `projects/${projectId}/videos/original-${Date.now()}-${originalFileName}`,
        status: 'UPLOADING',
        duration: 0,
        width: 0,
        height: 0,
      },
    })

    // Update project's currentRevision only if revisions are enabled
    // First upload = version 1, currentRevision = 0
    // Second upload = version 2, currentRevision = 1, etc.
    if (project.enableRevisions) {
      await prisma.project.update({
        where: { id: projectId },
        data: { currentRevision: nextVersion - 1 },
      })
    }

    // Return videoId - TUS will handle upload directly
    return NextResponse.json({
      videoId: video.id,
    })
  } catch (error) {
    console.error('Error creating video:', error)
    return NextResponse.json({ error: 'Failed to create video' }, { status: 500 })
  }
}
