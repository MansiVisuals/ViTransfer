import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateUniqueSlug } from '@/lib/utils'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt } from '@/lib/encryption'
import { rateLimit } from '@/lib/rate-limit'
import { createProjectSchema, validateRequest } from '@/lib/validation'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }
  const admin = authResult

  // CSRF Protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  // Rate limiting: Max 20 projects per hour
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    message: 'Too many projects created. Please try again later.'
  }, 'create-project')
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()

    // Validate request body
    const validation = validateRequest(createProjectSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, details: validation.details },
        { status: 400 }
      )
    }

    const {
      title,
      description,
      companyName,
      recipientEmail,
      recipientName,
      sharePassword,
      authMode,
      enableRevisions,
      maxRevisions,
      restrictCommentsToLatestVersion,
      isShareOnly
    } = validation.data

    // Fetch default settings for watermark and preview resolution
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        defaultPreviewResolution: true,
        defaultWatermarkEnabled: true,
        defaultWatermarkText: true,
      },
    })

    // Generate unique slug from title
    const slug = await generateUniqueSlug(title, prisma)

    // Encrypt share password if provided (so we can decrypt it later for email notifications)
    const encryptedSharePassword = sharePassword
      ? encrypt(sharePassword)
      : null

    // Use transaction to ensure atomicity: if recipient creation fails, project creation is rolled back
    const project = await prisma.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: {
          title,
          slug,
          description,
          companyName: companyName || null,
          sharePassword: encryptedSharePassword,
          authMode: authMode || 'PASSWORD',
          enableRevisions: isShareOnly ? false : (enableRevisions || false),
          maxRevisions: isShareOnly ? 0 : (enableRevisions ? (maxRevisions || 3) : 0),
          restrictCommentsToLatestVersion: isShareOnly ? false : (restrictCommentsToLatestVersion || false),
          status: isShareOnly ? 'SHARE_ONLY' : 'IN_REVIEW',
          hideFeedback: isShareOnly ? true : false,
          approvedAt: isShareOnly ? new Date() : null,
          previewResolution: settings?.defaultPreviewResolution || '720p',
          watermarkEnabled: settings?.defaultWatermarkEnabled ?? true,
          watermarkText: settings?.defaultWatermarkText || null,
          createdById: admin.id,
        },
      })

      // Create recipient if email provided (validated by schema)
      if (recipientEmail) {
        await tx.projectRecipient.create({
          data: {
            projectId: newProject.id,
            email: recipientEmail,
            name: recipientName || null,
            isPrimary: true,
          },
        })
      }

      return newProject
    })

    return NextResponse.json(project)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
