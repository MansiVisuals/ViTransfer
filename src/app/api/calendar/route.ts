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
