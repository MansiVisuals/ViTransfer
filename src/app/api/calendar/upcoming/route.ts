import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
  }, 'calendar-upcoming')
  if (rateLimitResult) return rateLimitResult

  try {
    const now = new Date()
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    const projects = await prisma.project.findMany({
      where: {
        dueDate: { not: null, lte: thirtyDaysFromNow },
        status: { not: 'ARCHIVED' },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        dueDate: true,
      },
      orderBy: { dueDate: 'asc' },
    })

    // Include overdue projects (dueDate < now)
    const upcoming = projects.filter(p => p.dueDate)

    return NextResponse.json({ projects: upcoming })
  } catch {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
