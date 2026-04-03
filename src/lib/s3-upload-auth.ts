import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseBearerToken, verifyAdminAccessToken, verifyShareToken } from '@/lib/auth'

/**
 * Shared authentication and authorization for S3 multipart upload routes
 * (presign, complete, abort).
 *
 * Verifies bearer token (admin or share), enforces ownership for non-admins,
 * and resolves the S3 key from the database — never from client input.
 */

interface S3UploadTarget {
  videoId?: string
  assetId?: string
  projectUploadId?: string
}

interface S3AuthSuccess {
  isAdmin: true
  s3Key: string
  errorResponse?: undefined
}

interface S3AuthShareSuccess {
  isAdmin: false
  s3Key: string
  errorResponse?: undefined
}

interface S3AuthFailure {
  isAdmin?: undefined
  s3Key?: undefined
  errorResponse: NextResponse
}

export type S3AuthResult = S3AuthSuccess | S3AuthShareSuccess | S3AuthFailure

/**
 * Authenticate the request and verify upload ownership.
 *
 * For non-abort operations, pass `requireUploadPermission: true` to enforce
 * comment permission, guest blocking, and feature-flag checks
 * (allowReverseShare / allowClientAssetUpload).
 *
 * For abort operations, ownership is still verified but feature-flag checks
 * are skipped (you should always be able to abort your own upload).
 */
export async function verifyS3UploadAccess(
  request: NextRequest,
  target: S3UploadTarget,
  options: { requireUploadPermission?: boolean } = {}
): Promise<S3AuthResult> {
  const { videoId, assetId, projectUploadId } = target
  const requireUploadPermission = options.requireUploadPermission ?? false

  if (!videoId && !assetId && !projectUploadId) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Missing required field: videoId, assetId, or projectUploadId' },
        { status: 400 }
      ),
    }
  }

  // ── Parse and verify bearer token ──────────────────────────────────────────
  const bearer = parseBearerToken(request)
  if (!bearer) {
    return { errorResponse: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }

  const adminPayload = await verifyAdminAccessToken(bearer)
  const isAdmin = !!adminPayload?.role && adminPayload.role === 'ADMIN'

  if (!isAdmin) {
    const sharePayload = await verifyShareToken(bearer)
    if (!sharePayload) {
      return { errorResponse: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
    }

    // Share tokens cannot touch video uploads (admin-only)
    if (videoId) {
      return { errorResponse: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
    }

    // Non-abort paths require comment permission and block guests
    if (requireUploadPermission) {
      if (!assetId && !projectUploadId) {
        return { errorResponse: NextResponse.json({ error: 'Share tokens can only upload assets or project files' }, { status: 403 }) }
      }
      if (!sharePayload.permissions?.includes('comment')) {
        return { errorResponse: NextResponse.json({ error: 'Comment permission required' }, { status: 403 }) }
      }
      if (sharePayload.guest) {
        return { errorResponse: NextResponse.json({ error: 'Guest access cannot upload files' }, { status: 403 }) }
      }
    }

    // ── Verify ownership + feature flags for projectUploadId ─────────────────
    if (projectUploadId) {
      const projectUpload = await prisma.projectUpload.findUnique({
        where: { id: projectUploadId },
        select: { storagePath: true, projectId: true, uploadedBySessionId: true },
      })
      if (!projectUpload) {
        return { errorResponse: NextResponse.json({ error: 'Upload record not found' }, { status: 404 }) }
      }
      if (projectUpload.projectId !== sharePayload.projectId) {
        return { errorResponse: NextResponse.json({ error: 'Upload does not belong to your project' }, { status: 403 }) }
      }
      if (projectUpload.uploadedBySessionId !== sharePayload.sessionId) {
        return { errorResponse: NextResponse.json({ error: 'Upload does not belong to your session' }, { status: 403 }) }
      }
      if (requireUploadPermission) {
        const project = await prisma.project.findUnique({
          where: { id: sharePayload.projectId },
          select: { allowReverseShare: true },
        })
        if (!project?.allowReverseShare) {
          return { errorResponse: NextResponse.json({ error: 'File submissions are not enabled for this project' }, { status: 403 }) }
        }
      }
      return { isAdmin: false, s3Key: projectUpload.storagePath }
    }

    // ── Verify ownership + feature flags for assetId ─────────────────────────
    if (assetId) {
      const asset = await prisma.videoAsset.findUnique({
        where: { id: assetId },
        select: {
          storagePath: true,
          uploadedBy: true,
          uploadedBySessionId: true,
          video: { select: { projectId: true } },
        },
      })
      if (!asset) {
        return { errorResponse: NextResponse.json({ error: 'Asset record not found' }, { status: 404 }) }
      }
      if (asset.uploadedBy !== 'client') {
        return { errorResponse: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
      }
      if (asset.video.projectId !== sharePayload.projectId) {
        return { errorResponse: NextResponse.json({ error: 'Asset does not belong to your project' }, { status: 403 }) }
      }
      if (asset.uploadedBySessionId !== sharePayload.sessionId) {
        return { errorResponse: NextResponse.json({ error: 'Asset does not belong to your session' }, { status: 403 }) }
      }
      if (requireUploadPermission) {
        const project = await prisma.project.findUnique({
          where: { id: sharePayload.projectId },
          select: { allowClientAssetUpload: true },
        })
        if (!project?.allowClientAssetUpload) {
          return { errorResponse: NextResponse.json({ error: 'File attachments are not enabled for this project' }, { status: 403 }) }
        }
      }
      return { isAdmin: false, s3Key: asset.storagePath }
    }
  }

  // ── Admin path: resolve S3 key from DB ─────────────────────────────────────
  if (videoId) {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { originalStoragePath: true },
    })
    if (!video) return { errorResponse: NextResponse.json({ error: 'Video record not found' }, { status: 404 }) }
    return { isAdmin: true, s3Key: video.originalStoragePath }
  }

  if (assetId) {
    const asset = await prisma.videoAsset.findUnique({
      where: { id: assetId },
      select: { storagePath: true },
    })
    if (!asset) return { errorResponse: NextResponse.json({ error: 'Asset record not found' }, { status: 404 }) }
    return { isAdmin: true, s3Key: asset.storagePath }
  }

  const projectUpload = await prisma.projectUpload.findUnique({
    where: { id: projectUploadId! },
    select: { storagePath: true },
  })
  if (!projectUpload) return { errorResponse: NextResponse.json({ error: 'Upload record not found' }, { status: 404 }) }
  return { isAdmin: true, s3Key: projectUpload.storagePath }
}
