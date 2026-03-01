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
    maxRequests: 30,
    message: 'Too many requests. Please slow down.'
  }, 'calendar-list')
  if (rateLimitResult) return rateLimitResult

  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    // Validate date parameters to prevent 500 errors on malicious input
    const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/
    if (from && (!ISO_DATE_REGEX.test(from) || isNaN(new Date(from).getTime()))) {
      return NextResponse.json({ error: 'Invalid "from" date parameter' }, { status: 400 })
    }
    if (to && (!ISO_DATE_REGEX.test(to) || isNaN(new Date(to).getTime()))) {
      return NextResponse.json({ error: 'Invalid "to" date parameter' }, { status: 400 })
    }

    const where: any = { dueDate: { not: null } }
    if (from || to) {
      where.dueDate = { ...where.dueDate }
      if (from) where.dueDate.gte = new Date(from)
      if (to) where.dueDate.lte = new Date(to)
    }

    const projects = await prisma.project.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        dueDate: true,
        createdAt: true,
      },
      orderBy: { dueDate: 'asc' },
    })

    return NextResponse.json({ projects })
  } catch {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
