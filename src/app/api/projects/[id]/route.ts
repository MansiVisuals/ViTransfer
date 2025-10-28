import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteFile } from '@/lib/storage'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt } from '@/lib/encryption'
import { cookies } from 'next/headers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        videos: {
          orderBy: { version: 'desc' },
        },
        comments: {
          where: { parentId: null },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
              }
            },
            replies: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    email: true,
                  }
                }
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Convert BigInt fields to strings for JSON serialization
    const projectData = {
      ...project,
      videos: project.videos.map((video: any) => ({
        ...video,
        originalFileSize: video.originalFileSize.toString(),
      })),
    }

    return NextResponse.json(projectData)
  } catch (error) {
    console.error('Failed to fetch project:', error)
    return NextResponse.json(
      { error: 'Unable to process request' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { id } = await params
    const body = await request.json()

    // Build update data object
    const updateData: any = {}

    // Handle basic project details
    if (body.title !== undefined) {
      updateData.title = body.title
    }
    if (body.slug !== undefined) {
      // Check if slug is unique (excluding current project)
      const existingProject = await prisma.project.findFirst({
        where: {
          slug: body.slug,
          NOT: { id }
        }
      })
      
      if (existingProject) {
        return NextResponse.json(
          { error: 'This share link is already in use. Please choose a different one.' },
          { status: 409 }
        )
      }
      
      updateData.slug = body.slug
    }
    if (body.description !== undefined) {
      updateData.description = body.description || null
    }
    if (body.clientName !== undefined) {
      updateData.clientName = body.clientName
    }
    if (body.clientEmail !== undefined) {
      updateData.clientEmail = body.clientEmail
    }

    // Handle status update (for approval)
    if (body.status !== undefined) {
      const validStatuses = ['IN_REVIEW', 'APPROVED', 'SHARE_ONLY']
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updateData.status = body.status

      // When admin approves project, approve ALL latest videos (one per unique video name)
      if (body.status === 'APPROVED') {
        updateData.approvedAt = new Date()

        // Get all videos for this project
        const allVideos = await prisma.video.findMany({
          where: { projectId: id },
          select: { id: true, name: true, versionLabel: true, createdAt: true },
          orderBy: { createdAt: 'desc' }
        })

        // Group videos by name and get the latest version of each
        const videosByName = allVideos.reduce((acc: Record<string, any>, video) => {
          if (!acc[video.name]) {
            acc[video.name] = video // First one is latest (due to desc order)
          }
          return acc
        }, {})

        // Get IDs of all latest videos
        const latestVideoIds = Object.values(videosByName).map((v: any) => v.id)

        // Unapprove all other videos (non-latest versions)
        await prisma.video.updateMany({
          where: {
            projectId: id,
            id: { notIn: latestVideoIds }
          },
          data: {
            approved: false,
            approvedAt: null
          }
        })

        // Approve all latest videos
        await prisma.video.updateMany({
          where: {
            projectId: id,
            id: { in: latestVideoIds }
          },
          data: {
            approved: true,
            approvedAt: new Date()
          }
        })

        // Set approvedVideoId to the first latest video (for backward compatibility)
        if (latestVideoIds.length > 0) {
          updateData.approvedVideoId = latestVideoIds[0]
        }
      }

      // When unapproving (changing from APPROVED to IN_REVIEW), clear all video approvals
      if (body.status === 'IN_REVIEW') {
        updateData.approvedVideoId = null
        updateData.approvedAt = null

        // Unapprove all videos
        await prisma.video.updateMany({
          where: { projectId: id },
          data: {
            approved: false,
            approvedAt: null
          }
        })
      }
    }

    // Handle revision settings
    if (body.enableRevisions !== undefined) {
      updateData.enableRevisions = body.enableRevisions
    }
    if (body.maxRevisions !== undefined) {
      updateData.maxRevisions = body.maxRevisions
    }
    if (body.currentRevision !== undefined) {
      updateData.currentRevision = body.currentRevision
    }

    // Handle comment restrictions
    if (body.restrictCommentsToLatestVersion !== undefined) {
      updateData.restrictCommentsToLatestVersion = body.restrictCommentsToLatestVersion
    }
    if (body.hideFeedback !== undefined) {
      updateData.hideFeedback = body.hideFeedback
    }

    // Handle video processing settings
    if (body.previewResolution !== undefined) {
      const validResolutions = ['720p', '1080p', '2160p']
      if (!validResolutions.includes(body.previewResolution)) {
        return NextResponse.json({ error: 'Invalid resolution' }, { status: 400 })
      }
      updateData.previewResolution = body.previewResolution
    }

    if (body.watermarkEnabled !== undefined) {
      updateData.watermarkEnabled = body.watermarkEnabled
    }

    if (body.watermarkText !== undefined) {
      updateData.watermarkText = body.watermarkText || null
    }

    // Handle password update
    if (body.sharePassword !== undefined) {
      if (body.sharePassword === null || body.sharePassword === '') {
        // Remove password
        updateData.sharePassword = null
      } else {
        // Encrypt password (so we can decrypt it later for email notifications)
        updateData.sharePassword = encrypt(body.sharePassword)
      }

      // Clear the authentication cookie when password changes
      // This forces users to re-authenticate with the new password
      const cookieStore = await cookies()
      cookieStore.delete(`share_auth_${id}`)
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(project)
  } catch (error) {
    console.error('Failed to update project:', error)
    return NextResponse.json(
      { error: 'Operation failed' },
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
    // Get project with all videos
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        videos: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Delete all video files from storage
    for (const video of project.videos) {
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
        // Continue deleting other files even if one fails
      }
    }

    // Delete project and all related data (cascade will handle videos, comments, shares)
    await prisma.project.delete({
      where: { id: id },
    })

    return NextResponse.json({ 
      success: true,
      message: 'Project and all related files deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    )
  }
}
