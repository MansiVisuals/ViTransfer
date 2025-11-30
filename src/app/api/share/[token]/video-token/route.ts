import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getShareContext } from '@/lib/auth'
import { generateVideoAccessToken } from '@/lib/video-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const url = new URL(request.url)
  const videoId = url.searchParams.get('videoId')
  const quality = url.searchParams.get('quality') || '720p'

  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 })
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

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      projectId: true,
      approved: true,
      thumbnailPath: true,
    },
  })

  if (!video || video.projectId !== project.id) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  if (quality === 'original' && !video.approved) {
    return NextResponse.json({ error: 'Original quality unavailable' }, { status: 403 })
  }

  const sessionId = shareContext.sessionId || `share:${project.id}:${token}`

  try {
    const tokenValue = await generateVideoAccessToken(
      video.id,
      project.id,
      quality,
      request,
      sessionId
    )

    return NextResponse.json({ token: tokenValue })
  } catch (error) {
    console.error('[SHARE] Failed to generate video token', { videoId, quality, error })
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }
}
