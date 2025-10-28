import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteFile } from '@/lib/storage'
import { requireApiAdmin } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { approved } = body

    if (typeof approved !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request: approved must be a boolean' },
        { status: 400 }
      )
    }

    // Get video details
    const video = await prisma.video.findUnique({
      where: { id },
      include: { project: true }
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // If approving this video, unapprove all other versions of the SAME video
    if (approved) {
      await prisma.video.updateMany({
        where: {
          projectId: video.projectId,
          name: video.name, // Same video name
          id: { not: id }, // But different version
        },
        data: {
          approved: false,
          approvedAt: null,
        },
      })
    }

    // Update video approval status
    await prisma.video.update({
      where: { id },
      data: {
        approved,
        approvedAt: approved ? new Date() : null
      }
    })

    // Check if all UNIQUE videos have at least one approved version
    const allVideos = await prisma.video.findMany({
      where: { projectId: video.projectId },
      select: { id: true, approved: true, name: true }
    })

    // Group videos by name to get unique videos
    const videosByName = allVideos.reduce((acc: Record<string, any[]>, video) => {
      if (!acc[video.name]) {
        acc[video.name] = []
      }
      acc[video.name].push(video)
      return acc
    }, {})

    // Check if each unique video has at least one approved version
    const allApproved = Object.values(videosByName).every((versions: any[]) =>
      versions.some(v => v.approved)
    )

    // Update project status based on video approvals
    if (allApproved && approved) {
      // All unique videos have approved versions → mark project as approved
      await prisma.project.update({
        where: { id: video.projectId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedVideoId: id
        }
      })
    } else if (!approved && video.project.status === 'APPROVED') {
      // Unapproving a video when project was approved → revert project to IN_REVIEW
      await prisma.project.update({
        where: { id: video.projectId },
        data: {
          status: 'IN_REVIEW',
          approvedAt: null,
          approvedVideoId: null
        }
      })
    }

    // Create audit comment
    await prisma.comment.create({
      data: {
        projectId: video.projectId,
        content: approved
          ? `Admin approved video "${video.name}" (${video.versionLabel}).`
          : `Admin unapproved video "${video.name}" (${video.versionLabel}).`,
        authorName: 'Admin',
        isInternal: true
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating video approval:', error)
    return NextResponse.json(
      { error: 'Failed to update video approval' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { id } = await params
    // Get video details
    const video = await prisma.video.findUnique({
      where: { id },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const projectId = video.projectId

    // Delete all associated files from storage
    try {
      // Delete original file
      if (video.originalStoragePath) {
        await deleteFile(video.originalStoragePath)
      }

      // Delete preview files
      if (video.preview1080Path) {
        await deleteFile(video.preview1080Path)
      }
      if (video.preview720Path) {
        await deleteFile(video.preview720Path)
      }

      // Delete thumbnail
      if (video.thumbnailPath) {
        await deleteFile(video.thumbnailPath)
      }
    } catch (error) {
      console.error(`Failed to delete files for video ${video.id}:`, error)
      // Continue with database deletion even if storage deletion fails
    }

    // Delete video from database (cascade will handle comments)
    await prisma.video.delete({
      where: { id: id },
    })

    // Update project's currentRevision to reflect the highest remaining version
    const remainingVideos = await prisma.video.findMany({
      where: { projectId },
      orderBy: { version: 'desc' },
      take: 1,
    })

    const newCurrentRevision = remainingVideos.length > 0 ? remainingVideos[0].version : 0

    await prisma.project.update({
      where: { id: projectId },
      data: { currentRevision: newCurrentRevision },
    })

    return NextResponse.json({
      success: true,
      message: 'Video and all related files deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting video:', error)
    return NextResponse.json(
      { error: 'Failed to delete video' },
      { status: 500 }
    )
  }
}
