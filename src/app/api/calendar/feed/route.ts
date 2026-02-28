import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { generateICalFeed } from '@/lib/ical'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many requests. Please slow down.'
  }, 'calendar-feed')
  if (rateLimitResult) return rateLimitResult

  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token || token.length < 32) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const calendarToken = await prisma.calendarToken.findUnique({
      where: { token },
    })

    if (!calendarToken) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { appDomain: true },
    })

    const domain = settings?.appDomain || 'https://localhost'

    const projects = await prisma.project.findMany({
      where: { dueDate: { not: null } },
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        updatedAt: true,
      },
    })

    const feed = generateICalFeed(
      projects.filter(p => p.dueDate).map(p => ({
        id: p.id,
        title: p.title,
        dueDate: p.dueDate!,
        status: p.status,
        updatedAt: p.updatedAt,
      })),
      domain
    )

    return new NextResponse(feed, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="vitransfer.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
