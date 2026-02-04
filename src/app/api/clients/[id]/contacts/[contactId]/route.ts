import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string; contactId: string }>
}

// PATCH /api/clients/[id]/contacts/[contactId] - Update a contact
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
  }, 'clients-contacts-update')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id, contactId } = await params
    const body = await request.json()
    const { name, email } = body

    // Verify contact exists and belongs to this company
    const existingContact = await prisma.clientContact.findFirst({
      where: {
        id: contactId,
        companyId: id
      }
    })

    if (!existingContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const updateData: { name?: string; email?: string | null } = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
      }
      updateData.name = name.trim()
    }

    if (email !== undefined) {
      const trimmedEmail = email?.trim() || null
      if (trimmedEmail && !trimmedEmail.includes('@')) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
      }
      updateData.email = trimmedEmail
    }

    const contact = await prisma.clientContact.update({
      where: { id: contactId },
      data: updateData
    })

    return NextResponse.json({ contact })
  } catch (error) {
    console.error('Failed to update contact:', error)
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 })
  }
}

// DELETE /api/clients/[id]/contacts/[contactId] - Delete a contact
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
  }, 'clients-contacts-delete')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id, contactId } = await params

    // Verify contact exists and belongs to this company
    const existingContact = await prisma.clientContact.findFirst({
      where: {
        id: contactId,
        companyId: id
      }
    })

    if (!existingContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await prisma.clientContact.delete({
      where: { id: contactId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete contact:', error)
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 })
  }
}
