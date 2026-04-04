import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getShareContext } from '@/lib/auth'
import { logError } from '@/lib/logging'
import { generateVideoAccessToken } from '@/lib/video-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const url = new URL(request.url)
  const photoId = url.searchParams.get('photoId')

  if (!photoId) {
    return NextResponse.json({ error: 'photoId is required' }, { status: 400 })
  }

  const shareContext = await getShareContext(request)
  if (!shareContext) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const project = await prisma.project.findUnique({
    where: { id: shareContext.projectId },
    select: { id: true, slug: true },
  })

  if (!project || project.slug !== token) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      projectId: true,
      approved: true,
    },
  })

  if (!photo || photo.projectId !== project.id) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  const sessionId = shareContext.sessionId || `share:${project.id}:${token}`

  try {
    const tokenValue = await generateVideoAccessToken(
      photo.id,
      project.id,
      'original',
      request,
      sessionId
    )

    return NextResponse.json({ token: tokenValue })
  } catch (error) {
    logError(`[SHARE] Failed to generate photo token (photoId=${photoId})`, error)
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }
}
