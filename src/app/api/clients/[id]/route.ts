import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/clients/[id] - Get a single client company with contacts
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
  }, 'clients-get')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id } = await params

    const company = await prisma.clientCompany.findUnique({
      where: { id },
      include: {
        contacts: {
          orderBy: { name: 'asc' }
        },
        _count: {
          select: { projects: true }
        }
      }
    })

    if (!company) {
      return NextResponse.json({ error: 'Client company not found' }, { status: 404 })
    }

    return NextResponse.json({ company })
  } catch (error) {
    console.error('Failed to fetch client company:', error)
    return NextResponse.json({ error: 'Failed to fetch client company' }, { status: 500 })
  }
}

// PATCH /api/clients/[id] - Update a client company
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
  }, 'clients-update')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id } = await params
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Check for duplicate (excluding current company)
    const existing = await prisma.clientCompany.findFirst({
      where: {
        name: trimmedName,
        NOT: { id }
      }
    })

    if (existing) {
      return NextResponse.json({ error: 'A company with this name already exists' }, { status: 409 })
    }

    const company = await prisma.clientCompany.update({
      where: { id },
      data: { name: trimmedName },
      include: {
        contacts: true,
        _count: { select: { projects: true } }
      }
    })

    return NextResponse.json({ company })
  } catch (error) {
    console.error('Failed to update client company:', error)
    return NextResponse.json({ error: 'Failed to update client company' }, { status: 500 })
  }
}

// DELETE /api/clients/[id] - Delete a client company
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
  }, 'clients-delete')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id } = await params

    // Check if company exists
    const company = await prisma.clientCompany.findUnique({
      where: { id },
      include: {
        _count: { select: { projects: true } }
      }
    })

    if (!company) {
      return NextResponse.json({ error: 'Client company not found' }, { status: 404 })
    }

    // Delete company (contacts will cascade delete)
    await prisma.clientCompany.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete client company:', error)
    return NextResponse.json({ error: 'Failed to delete client company' }, { status: 500 })
  }
}
