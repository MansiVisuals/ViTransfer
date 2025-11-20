import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const copyAssetsSchema = z.object({
  assetIds: z.array(z.string().min(1)).min(1, 'No assets selected for copying').max(50, 'Too many assets selected'),
  targetVideoId: z.string().min(1, 'Target video version not specified'),
})

// POST /api/videos/[id]/assets/copy-to-version - Copy assets to another video version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 2. CSRF PROTECTION
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  // 3. RATE LIMITING
  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 20,
      message: 'Too many asset copy requests. Please slow down.',
    },
    'copy-assets-to-version'
  )
  if (rateLimitResult) return rateLimitResult

  const { id: sourceVideoId } = await params

  try {
    const body = await request.json()
    const parsed = copyAssetsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      )
    }
    const { assetIds, targetVideoId } = parsed.data

    // Verify source video exists
    const sourceVideo = await prisma.video.findUnique({
      where: { id: sourceVideoId },
    })

    if (!sourceVideo) {
      return NextResponse.json({ error: 'Source video not found' }, { status: 404 })
    }

    // Verify target video exists and is in same project
    const targetVideo = await prisma.video.findUnique({
      where: { id: targetVideoId },
    })

    if (!targetVideo) {
      return NextResponse.json({ error: 'Target video not found' }, { status: 404 })
    }

    if (sourceVideo.projectId !== targetVideo.projectId) {
      return NextResponse.json(
        { error: 'Cannot copy assets between different projects' },
        { status: 400 }
      )
    }

    // Get all requested assets
    const assets = await prisma.videoAsset.findMany({
      where: {
        id: { in: assetIds },
        videoId: sourceVideoId,
      },
    })

    if (assets.length === 0) {
      return NextResponse.json({ error: 'No valid assets found' }, { status: 404 })
    }

    // Copy assets to target video (create new asset records pointing to same storage)
    // This is a symlink-like approach - multiple asset records point to same file
    const copiedAssets = await Promise.all(
      assets.map((asset) =>
        prisma.videoAsset.create({
          data: {
            videoId: targetVideoId,
            fileName: asset.fileName,
            fileSize: asset.fileSize,
            fileType: asset.fileType,
            storagePath: asset.storagePath, // Same storage path (symlink approach)
            category: asset.category,
            uploadedBy: asset.uploadedBy,
            uploadedByName: asset.uploadedByName,
          },
        })
      )
    )

    return NextResponse.json({
      success: true,
      message: `Successfully copied ${copiedAssets.length} asset(s) to target version`,
      copiedCount: copiedAssets.length,
    })
  } catch (error) {
    console.error('Error copying assets to version:', error)
    return NextResponse.json(
      { error: 'Failed to copy assets' },
      { status: 500 }
    )
  }
}
