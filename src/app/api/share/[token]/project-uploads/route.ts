import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { verifyProjectAccess } from '@/lib/project-access'
import { getShareContext } from '@/lib/auth'
import { validateAssetFile, sanitizeFilename, isSuspiciousFilename } from '@/lib/file-validation'
import { deleteFile } from '@/lib/storage'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

// POST /api/share/[token]/project-uploads — client creates a project upload record
// The actual file upload goes through TUS at /api/uploads with projectUploadId metadata
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const shareMessages = messages?.share || {}

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: shareMessages.tooManyRequestsGeneric || 'Too many requests. Please try again later.',
  }, 'project-upload-create')
  if (rateLimitResult) return rateLimitResult

  try {
    const { token: shareToken } = await params

    const project = await prisma.project.findUnique({
      where: { slug: shareToken },
      select: {
        id: true,
        sharePassword: true,
        authMode: true,
        allowReverseShare: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: shareMessages.projectNotFound || 'Project not found' }, { status: 404 })
    }

    if (!project.allowReverseShare) {
      return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 403 })
    }

    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode, {
      requiredPermission: 'comment',
      allowGuest: false,
    })

    if (!accessCheck.authorized) {
      return accessCheck.errorResponse || NextResponse.json({ error: shareMessages.unauthorized || 'Unauthorized' }, { status: 403 })
    }

    const sessionId = accessCheck.shareTokenSessionId
    if (!sessionId) {
      return NextResponse.json({ error: shareMessages.unauthorized || 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { fileName, fileSize, authorName, authorEmail } = body

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
    }

    if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
      return NextResponse.json({ error: 'Valid fileSize is required' }, { status: 400 })
    }

    // Validate optional submitter fields at the system boundary
    if (authorName !== undefined && authorName !== null && (typeof authorName !== 'string' || authorName.length > 100)) {
      return NextResponse.json({ error: 'Invalid author name' }, { status: 400 })
    }
    if (authorEmail !== undefined && authorEmail !== null && (typeof authorEmail !== 'string' || authorEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail))) {
      return NextResponse.json({ error: 'Invalid author email' }, { status: 400 })
    }

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

    if (isSuspiciousFilename(fileName)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    }

    const sanitizedFileName = sanitizeFilename(fileName)
    const assetValidation = validateAssetFile(sanitizedFileName, 'application/octet-stream', undefined)

    if (!assetValidation.valid) {
      return NextResponse.json({ error: assetValidation.error || 'Invalid file type' }, { status: 400 })
    }

    const finalFileName = assetValidation.sanitizedFilename || sanitizedFileName
    const storagePath = `projects/${project.id}/uploads/${Date.now()}-${finalFileName}`
    const category = assetValidation.detectedCategory || 'other'

    // Resolve uploader identity from OTP-authenticated recipient if not explicitly provided
    let resolvedName: string | null = authorName || null
    let resolvedEmail: string | null = authorEmail || null

    if (!resolvedName && !resolvedEmail) {
      const shareContext = await getShareContext(request)
      if (shareContext?.recipientId) {
        const recipient = await prisma.projectRecipient.findUnique({
          where: { id: shareContext.recipientId },
          select: { name: true, email: true },
        })
        if (recipient) {
          resolvedName = recipient.name || null
          resolvedEmail = recipient.email || null
        }
      }
    }

    const upload = await prisma.projectUpload.create({
      data: {
        projectId: project.id,
        fileName: finalFileName,
        fileSize: BigInt(fileSize),
        fileType: 'application/octet-stream',
        storagePath,
        category,
        uploadedBySessionId: sessionId,
        uploadedByName: resolvedName,
        uploadedByEmail: resolvedEmail,
      },
    })

    return NextResponse.json({
      uploadId: upload.id,
      fileName: finalFileName,
      category,
    })
  } catch (error) {
    logError('Error creating project upload record:', error)
    return NextResponse.json({ error: 'Failed to create upload record' }, { status: 500 })
  }
}

// DELETE /api/share/[token]/project-uploads?uploadId=xxx — client deletes a pending upload
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const shareMessages = messages?.share || {}

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: shareMessages.tooManyRequestsGeneric || 'Too many requests. Please try again later.',
  }, 'project-upload-delete-client')
  if (rateLimitResult) return rateLimitResult

  try {
    const { token: shareToken } = await params
    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId') ?? ''

    const project = await prisma.project.findUnique({
      where: { slug: shareToken },
      select: { id: true, sharePassword: true, authMode: true, allowReverseShare: true },
    })

    if (!project || !project.allowReverseShare) {
      return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 403 })
    }

    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode, {
      requiredPermission: 'comment',
      allowGuest: false,
    })

    if (!accessCheck.authorized) {
      return NextResponse.json({ error: shareMessages.unauthorized || 'Unauthorized' }, { status: 403 })
    }

    const sessionId = accessCheck.shareTokenSessionId
    if (!sessionId) {
      return NextResponse.json({ error: shareMessages.unauthorized || 'Unauthorized' }, { status: 403 })
    }

    const upload = await prisma.projectUpload.findFirst({
      where: { id: uploadId, projectId: project.id, uploadedBySessionId: sessionId },
      select: { id: true, storagePath: true },
    })

    if (!upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    await deleteFile(upload.storagePath)
    await prisma.projectUpload.delete({ where: { id: upload.id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('Error deleting project upload:', error)
    return NextResponse.json({ error: 'Failed to delete upload' }, { status: 500 })
  }
}
