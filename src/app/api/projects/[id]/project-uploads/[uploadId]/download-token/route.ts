import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { getClientIpAddress } from '@/lib/utils'
import { logError } from '@/lib/logging'
import crypto from 'crypto'

export const runtime = 'nodejs'

/**
 * Mint a one-time download token for a project-upload file. The admin UI
 * uses this so the browser can navigate directly to the download URL via
 * `<a href download>` and trigger the native save dialog immediately —
 * without first fetching the whole file into memory as a Blob (which made
 * large downloads feel like "the browser is downloading first").
 *
 * The token is bound to the requester's IP + UA hash and consumed atomically
 * on the GET endpoint, so a leaked URL doesn't grant ongoing access.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.',
  }, 'project-upload-download-token', authResult.id)
  if (rateLimitResult) return rateLimitResult

  try {
    const { id: projectId, uploadId } = await params

    const upload = await prisma.projectUpload.findFirst({
      where: { id: uploadId, projectId },
      select: { id: true },
    })
    if (!upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    const token = crypto.randomBytes(32).toString('base64url')
    const ipAddress = getClientIpAddress(request)
    const userAgentHash = crypto
      .createHash('sha256')
      .update(request.headers.get('user-agent') || 'unknown')
      .digest('hex')

    const redis = getRedis()
    const payload = JSON.stringify({ projectId, uploadId, ipAddress, userAgentHash })
    // 5-minute TTL: long enough to click the download, short enough that a
    // leaked URL can't be replayed later.
    await redis.set(`project_upload_dl:${token}`, payload, 'EX', 300)

    return NextResponse.json({
      url: `/api/projects/${projectId}/project-uploads/${uploadId}/download?dlt=${token}`,
    })
  } catch (error) {
    logError('Failed to mint project upload download token:', error)
    return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
  }
}
