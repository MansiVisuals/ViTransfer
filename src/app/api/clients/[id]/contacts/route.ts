import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/clients/[id]/contacts - List contacts for a company
export async function GET(request: NextRequest, { params }: RouteParams) {
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
  }, 'clients-contacts-list')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id } = await params

    const contacts = await prisma.clientContact.findMany({
      where: { companyId: id },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ contacts })
  } catch (error) {
    console.error('Failed to fetch contacts:', error)
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
  }
}

// POST /api/clients/[id]/contacts - Add a contact to a company
export async function POST(request: NextRequest, { params }: RouteParams) {
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
  }, 'clients-contacts-create')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id } = await params
    const body = await request.json()
    const { name, email } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
    }

    // Verify company exists
    const company = await prisma.clientCompany.findUnique({
      where: { id }
    })

    if (!company) {
      return NextResponse.json({ error: 'Client company not found' }, { status: 404 })
    }

    const trimmedEmail = email?.trim() || null

    // Validate email format if provided
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const contact = await prisma.clientContact.create({
      data: {
        companyId: id,
        name: name.trim(),
        email: trimmedEmail
      }
    })

    return NextResponse.json({ contact }, { status: 201 })
  } catch (error) {
    console.error('Failed to create contact:', error)
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 })
  }
}
