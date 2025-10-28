import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateUniqueSlug } from '@/lib/utils'
import { requireApiAdmin } from '@/lib/auth'
import { encrypt } from '@/lib/encryption'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }
  const admin = authResult

  try {
    const body = await request.json()
    const { 
      title, 
      description, 
      clientName, 
      clientEmail, 
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
        clientName,
        clientEmail,
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

    return NextResponse.json(project)
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
