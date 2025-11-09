import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateUniqueSlug } from '@/lib/utils'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt } from '@/lib/encryption'
import { rateLimit } from '@/lib/rate-limit'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }
  const admin = authResult

  // Rate limiting: Max 20 projects per hour
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    message: 'Too many projects created. Please try again later.'
  }, 'create-project')
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const {
      title,
      description,
      recipientEmail,
      recipientName,
      sharePassword,
      enableRevisions,
      maxRevisions,
      restrictCommentsToLatestVersion,
      isShareOnly
    } = body

    // Fetch default settings for watermark and preview resolution
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        defaultPreviewResolution: true,
        defaultWatermarkText: true,
      },
    })

    // Generate unique slug from title
    const slug = await generateUniqueSlug(title, prisma)

    // Encrypt share password if provided (so we can decrypt it later for email notifications)
    const encryptedSharePassword = sharePassword
      ? encrypt(sharePassword)
      : null

    const project = await prisma.project.create({
      data: {
        title,
        slug,
        description,
        sharePassword: encryptedSharePassword,
        enableRevisions: isShareOnly ? false : (enableRevisions || false),
        maxRevisions: isShareOnly ? 0 : (enableRevisions ? (maxRevisions || 3) : 0),
        restrictCommentsToLatestVersion: isShareOnly ? false : (restrictCommentsToLatestVersion || false),
        status: isShareOnly ? 'SHARE_ONLY' : 'IN_REVIEW',
        hideFeedback: isShareOnly ? true : false,
        approvedAt: isShareOnly ? new Date() : null,
        previewResolution: settings?.defaultPreviewResolution || '720p',
        watermarkText: settings?.defaultWatermarkText || null,
        createdById: admin.id,
      },
    })

    // Create initial recipient if email provided (optional)
    if (recipientEmail) {
      await prisma.projectRecipient.create({
        data: {
          projectId: project.id,
          email: recipientEmail,
          name: recipientName || null,
          isPrimary: true,
        },
      }).catch(error => {
        // Don't fail project creation if recipient creation fails
        console.error('Failed to create initial recipient:', error)
      })
    }

    return NextResponse.json(project)
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
