import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { verifyProjectAccess } from '@/lib/project-access'
import { validateAssetFile, sanitizeFilename, isSuspiciousFilename } from '@/lib/file-validation'
import { initStorage, deleteFile } from '@/lib/storage'
export const runtime = 'nodejs'

// POST /api/videos/[id]/client-assets - Create a client asset record (JSON)
// The actual file upload goes through TUS at /api/uploads
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params

  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 60,
      message: 'Too many requests. Please slow down.',
    },
    'client-asset-create'
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

    // Parse JSON body
    const body = await request.json()
    const { fileName, fileSize, category: requestedCategory, authorName, authorEmail } = body

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
    }

    if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
      return NextResponse.json({ error: 'Valid fileSize is required' }, { status: 400 })
    }

    // Enforce global maxUploadSizeGB limit
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { maxUploadSizeGB: true },
    })
    const maxBytes = (settings?.maxUploadSizeGB || 1) * 1024 * 1024 * 1024
    if (fileSize > maxBytes) {
      return NextResponse.json(
        { error: `File exceeds maximum upload size of ${settings?.maxUploadSizeGB || 1} GB` },
        { status: 400 }
      )
    }

    // Check for suspicious filename
    if (isSuspiciousFilename(fileName)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      )
    }

    // Sanitize filename
    const sanitizedFileName = sanitizeFilename(fileName)

    // Validate asset file (use a generic mime type since we don't have the file yet)
    const mimeType = 'application/octet-stream'
    const assetValidation = validateAssetFile(sanitizedFileName, mimeType, requestedCategory)

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

    // Create database record (file will be uploaded via TUS)
    const asset = await prisma.videoAsset.create({
      data: {
        videoId,
        fileName: finalFileName,
        fileSize: BigInt(fileSize),
        fileType: mimeType,
        storagePath,
        category,
        uploadedBy: 'client',
        uploadedByName: authorName || authorEmail || null,
      },
    })

    return NextResponse.json({
      assetId: asset.id,
      fileName: finalFileName,
      fileSize: fileSize.toString(),
      fileType: mimeType,
      category,
    })
  } catch (error) {
    console.error('Error creating client asset record:', error)
    return NextResponse.json(
      { error: 'Failed to create asset record' },
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
      id: asset.id,
      videoId: asset.videoId,
      fileName: asset.fileName,
      fileSize: asset.fileSize.toString(),
      fileType: asset.fileType,
      category: asset.category,
      commentId: asset.commentId,
      createdAt: asset.createdAt,
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
