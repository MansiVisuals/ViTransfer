import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUserFromRequest, requireApiAdmin } from '@/lib/auth'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'
import { rateLimit } from '@/lib/rate-limit'
import { verifyProjectAccess } from '@/lib/project-access'
import { validateAssetFile } from '@/lib/file-validation'
import { z } from 'zod'
export const runtime = 'nodejs'




const createAssetSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.union([z.number(), z.string()])
    .transform(val => Number(val))
    .refine(val => Number.isFinite(val) && Number.isInteger(val) && val > 0 && val <= Number.MAX_SAFE_INTEGER, {
      message: 'fileSize must be a positive integer',
    }),
  category: z.string().max(100).nullable().optional(),
  mimeType: z.string().max(255).optional(),
})

// GET /api/videos/[id]/assets - List all assets for a video
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
    'video-assets-list'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    // Verify video exists
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
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode)
    if (!accessCheck.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // For non-admins, check if asset downloads are allowed
    if (!accessCheck.isAdmin && !project.allowAssetDownload) {
      return NextResponse.json(
        { error: 'Asset downloads are not allowed for this project' },
        { status: 403 }
      )
    }

    if (!accessCheck.isAdmin && !video.approved) {
      return NextResponse.json(
        { error: 'Assets are only available for approved videos' },
        { status: 403 }
      )
    }

    // Get all assets for this video
    const assets = await prisma.videoAsset.findMany({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    })

    // Convert BigInt to string for JSON serialization
    const serializedAssets = assets.map(asset => ({
      ...asset,
      fileSize: asset.fileSize.toString(),
    }))

    return NextResponse.json({
      assets: serializedAssets,
      currentThumbnailPath: video.thumbnailPath
    })
  } catch (error) {
    console.error('Error fetching video assets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch video assets' },
      { status: 500 }
    )
  }
}

// POST /api/videos/[id]/assets - Create asset record for TUS upload
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: videoId } = await params

  // Authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // CSRF Protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  // Rate limiting
  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 50,
      message: 'Too many upload requests. Please slow down.',
    },
    'video-assets-create'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    // Verify video exists
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        project: true,
      },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Get current user for tracking
    const currentUser = await getCurrentUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const parsed = createAssetSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { fileName, fileSize, category, mimeType } = parsed.data
    const normalizedCategory = category ?? undefined

    // Validate required fields
    if (!fileName || !fileSize) {
      return NextResponse.json(
        { error: 'fileName and fileSize are required' },
        { status: 400 }
      )
    }

    // Validate asset file
    const assetValidation = validateAssetFile(fileName, mimeType || 'application/octet-stream', normalizedCategory)

    if (!assetValidation.valid) {
      return NextResponse.json(
        { error: assetValidation.error || 'Invalid asset file' },
        { status: 400 }
      )
    }

    // Create storage path (use sanitized filename from validation)
    const timestamp = Date.now()
    const sanitizedFileName = assetValidation.sanitizedFilename || fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255)
    const storagePath = `projects/${video.projectId}/videos/assets/${videoId}/asset-${timestamp}-${sanitizedFileName}`

    // Use detected category if not provided
    const finalCategory = normalizedCategory || assetValidation.detectedCategory || 'other'

    // Create database record (TUS will upload the file later)
    const asset = await prisma.videoAsset.create({
      data: {
        videoId,
        fileName: sanitizedFileName,
        fileSize: BigInt(fileSize),
        fileType: mimeType || 'application/octet-stream',
        storagePath,
        category: finalCategory,
        uploadedBy: currentUser.id,
        uploadedByName: currentUser.name || currentUser.email,
      },
    })

    // Return assetId for TUS upload
    return NextResponse.json({
      assetId: asset.id,
    })
  } catch (error) {
    console.error('Error creating video asset:', error)
    return NextResponse.json(
      { error: 'Failed to create video asset' },
      { status: 500 }
    )
  }
}
