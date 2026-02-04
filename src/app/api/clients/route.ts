import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

// GET /api/clients - List all client companies with contacts
export async function GET(request: NextRequest) {
  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 2. RATE LIMITING
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
  }, 'clients-list')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase() || ''

    const companies = await prisma.clientCompany.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { contacts: { some: { name: { contains: search, mode: 'insensitive' } } } },
          { contacts: { some: { email: { contains: search, mode: 'insensitive' } } } },
        ]
      } : undefined,
      include: {
        contacts: {
          orderBy: { name: 'asc' }
        },
        _count: {
          select: { projects: true }
        }
      },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ companies })
  } catch (error) {
    console.error('Failed to fetch clients:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

// POST /api/clients - Create a new client company
export async function POST(request: NextRequest) {
  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 2. RATE LIMITING
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many requests. Please slow down.'
  }, 'clients-create')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Check for duplicate
    const existing = await prisma.clientCompany.findUnique({
      where: { name: trimmedName }
    })

    if (existing) {
      return NextResponse.json({ error: 'A company with this name already exists' }, { status: 409 })
    }

    const company = await prisma.clientCompany.create({
      data: { name: trimmedName },
      include: {
        contacts: true,
        _count: { select: { projects: true } }
      }
    })

    return NextResponse.json({ company }, { status: 201 })
  } catch (error) {
    console.error('Failed to create client company:', error)
    return NextResponse.json({ error: 'Failed to create client company' }, { status: 500 })
  }
}
