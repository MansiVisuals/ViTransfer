import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { verifyProjectAccess } from '@/lib/project-access'
import { validateAssetFile, sanitizeFilename, isSuspiciousFilename } from '@/lib/file-validation'
import { uploadFile, initStorage, deleteFile } from '@/lib/storage'
import { getAssetQueue } from '@/lib/queue'
export const runtime = 'nodejs'

// POST /api/videos/[id]/client-assets - Upload a client asset (multipart)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params

  // Rate limiting: 10 req/min
  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 10,
      message: 'Too many upload requests. Please slow down.',
    },
    'client-asset-upload'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    // Verify video exists and get project
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { project: true },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const project = video.project

    // Check if client asset upload is enabled for this project
    if (!project.allowClientAssetUpload) {
      return NextResponse.json(
        { error: 'File attachments are not enabled for this project' },
        { status: 403 }
      )
    }

    // Auth via verifyProjectAccess with comment permission, no guests
    const accessCheck = await verifyProjectAccess(
      request,
      project.id,
      project.sharePassword,
      project.authMode,
      {
        requiredPermission: 'comment',
        allowGuest: false,
      }
    )

    if (!accessCheck.authorized) {
      return accessCheck.errorResponse || NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Parse FormData
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const authorName = (formData.get('authorName') as string) || undefined
    const authorEmail = (formData.get('authorEmail') as string) || undefined

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Enforce global maxUploadSizeGB limit
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { maxUploadSizeGB: true },
    })
    const maxBytes = (settings?.maxUploadSizeGB || 1) * 1024 * 1024 * 1024
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File exceeds maximum upload size of ${settings?.maxUploadSizeGB || 1} GB` },
        { status: 400 }
      )
    }

    const originalFilename = file.name || 'upload.bin'

    // Check for suspicious filename
    if (isSuspiciousFilename(originalFilename)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      )
    }

    // Sanitize filename
    const sanitizedFileName = sanitizeFilename(originalFilename)

    // Validate asset file (same as admin uploads)
    const mimeType = file.type || 'application/octet-stream'
    const assetValidation = validateAssetFile(sanitizedFileName, mimeType)

    if (!assetValidation.valid) {
      return NextResponse.json(
        { error: assetValidation.error || 'Invalid file type' },
        { status: 400 }
      )
    }

    // Generate storage path
    const timestamp = Date.now()
    const finalFileName = assetValidation.sanitizedFilename || sanitizedFileName
    const storagePath = `projects/${project.id}/videos/assets/${videoId}/client-${timestamp}-${finalFileName}`
    const category = assetValidation.detectedCategory || 'other'

    // Store file via uploadFile (same 7-layer path traversal protection)
    await initStorage()
    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadFile(storagePath, buffer, file.size, mimeType)

    // Create database record — clean up file on failure
    let asset
    try {
      asset = await prisma.videoAsset.create({
        data: {
          videoId,
          fileName: finalFileName,
          fileSize: BigInt(file.size),
          fileType: mimeType,
          storagePath,
          category,
          uploadedBy: 'client',
          uploadedByName: authorName || authorEmail || null,
        },
      })
    } catch (dbError) {
      // DB insert failed — remove orphaned file from disk
      await deleteFile(storagePath).catch(() => {})
      throw dbError
    }

    // Queue worker job for magic byte validation (same as admin uploads)
    try {
      const queue = getAssetQueue()
      await queue.add('process-asset', {
        assetId: asset.id,
        storagePath,
        expectedCategory: category,
      })
    } catch (queueError) {
      console.error('[CLIENT-ASSET] Failed to queue asset processing:', queueError)
      // Don't fail the upload if queue is unavailable
    }

    return NextResponse.json({
      assetId: asset.id,
      fileName: finalFileName,
      fileSize: file.size.toString(),
      fileType: mimeType,
      category,
    })
  } catch (error) {
    console.error('Error uploading client asset:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}

// GET /api/videos/[id]/client-assets - List client assets for a video
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params

  // Rate limiting
  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 60,
      message: 'Too many requests. Please slow down.',
    },
    'client-asset-list'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { project: true },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const project = video.project

    // Auth via verifyProjectAccess
    const accessCheck = await verifyProjectAccess(
      request,
      project.id,
      project.sharePassword,
      project.authMode,
    )

    if (!accessCheck.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const assets = await prisma.videoAsset.findMany({
      where: {
        videoId,
        uploadedBy: 'client',
      },
      orderBy: { createdAt: 'desc' },
    })

    const serializedAssets = assets.map(asset => ({
      ...asset,
      fileSize: asset.fileSize.toString(),
    }))

    return NextResponse.json({ assets: serializedAssets })
  } catch (error) {
    console.error('Error fetching client assets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch client assets' },
      { status: 500 }
    )
  }
}

// DELETE /api/videos/[id]/client-assets?assetId=xxx - Delete an unlinked pending client asset
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params

  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: 'Too many requests. Please slow down.',
    },
    'client-asset-delete'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const { searchParams } = new URL(request.url)
    const assetId = searchParams.get('assetId')
    if (!assetId) {
      return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 })
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { project: true },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const project = video.project

    const accessCheck = await verifyProjectAccess(
      request,
      project.id,
      project.sharePassword,
      project.authMode,
      {
        requiredPermission: 'comment',
        allowGuest: false,
      }
    )

    if (!accessCheck.authorized) {
      return accessCheck.errorResponse || NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const asset = await prisma.videoAsset.findFirst({
      where: {
        id: assetId,
        videoId,
        uploadedBy: 'client',
        commentId: null,
      },
      select: {
        id: true,
        storagePath: true,
      },
    })

    if (!asset) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    await prisma.videoAsset.delete({ where: { id: asset.id } })

    await initStorage()
    await deleteFile(asset.storagePath).catch((error) => {
      console.warn('[CLIENT-ASSET] Failed to delete file after record cleanup:', error)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting client asset:', error)
    return NextResponse.json(
      { error: 'Failed to delete attachment' },
      { status: 500 }
    )
  }
}
