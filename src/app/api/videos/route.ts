import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'
import { validateUploadedFile } from '@/lib/file-validation'
export const runtime = 'nodejs'




// Prevent static generation for this route
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }
  const admin = authResult

  // CSRF protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  // Rate limiting: Max 50 video uploads per hour
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    message: 'Too many video uploads. Please try again later.'
  }, 'upload-video')
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const { projectId, versionLabel, originalFileName, originalFileSize, name, mimeType } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Video name is required' }, { status: 400 })
    }

    const videoName = name.trim()

    // Validate uploaded file
    const fileValidation = validateUploadedFile(
      originalFileName || 'upload.mp4',
      mimeType || 'video/mp4',
      originalFileSize || 0
    )

    if (!fileValidation.valid) {
      return NextResponse.json(
        { error: fileValidation.error || 'Invalid file' },
        { status: 400 }
      )
    }

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

    // Check if revisions are enabled and validate (per-video tracking)
    if (project.enableRevisions && project.maxRevisions > 0) {
      // Count existing versions for this specific video name (project.videos is already filtered by name)
      const existingVersionCount = project.videos.length

      if (existingVersionCount >= project.maxRevisions) {
        return NextResponse.json(
          { error: `Maximum revisions (${project.maxRevisions}) exceeded for this video` },
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

    // Return videoId - TUS will handle upload directly
    return NextResponse.json({
      videoId: video.id,
    })
  } catch (error) {
    console.error('Error creating video:', error)
    return NextResponse.json({ error: 'Failed to create video' }, { status: 500 })
  }
}
