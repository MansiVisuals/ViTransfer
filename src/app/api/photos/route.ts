import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { validatePhotoFile } from '@/lib/file-validation'
import { validateRequest, createPhotoSchema } from '@/lib/validation'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: Max 100 photo uploads per hour
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 60 * 1000,
    maxRequests: 100,
    message: 'Too many photo uploads. Please try again later.'
  }, 'upload-photo')
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()

    const validation = validateRequest(createPhotoSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, details: validation.details },
        { status: 400 }
      )
    }

    const { projectId, originalFileName, originalFileSize, mimeType, name, width, height } = validation.data

    // Validate photo file type
    const fileValidation = validatePhotoFile(
      originalFileName,
      mimeType || 'image/jpeg',
      originalFileSize
    )

    if (!fileValidation.valid) {
      return NextResponse.json(
        { error: fileValidation.error || 'Invalid file' },
        { status: 400 }
      )
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Get current max sortOrder for this project
    const lastPhoto = await prisma.photo.findFirst({
      where: { projectId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const nextSortOrder = (lastPhoto?.sortOrder ?? -1) + 1

    // Derive photo name from filename if not provided
    const photoName = name || originalFileName.replace(/\.[^.]+$/, '')

    // Create photo record
    const photo = await prisma.photo.create({
      data: {
        projectId,
        name: photoName,
        originalFileName,
        originalFileSize: BigInt(originalFileSize),
        originalStoragePath: `projects/${projectId}/photos/${Date.now()}-${fileValidation.sanitizedFilename || originalFileName}`,
        mimeType: mimeType || 'image/jpeg',
        width: width || null,
        height: height || null,
        sortOrder: nextSortOrder,
        status: 'UPLOADING',
      },
    })

    return NextResponse.json({ photoId: photo.id, storagePath: photo.originalStoragePath })
  } catch (error) {
    logError('Error creating photo:', error)
    return NextResponse.json({ error: 'Failed to create photo' }, { status: 500 })
  }
}
