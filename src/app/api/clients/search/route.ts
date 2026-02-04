import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

// GET /api/clients/search - Search clients for autocomplete
export async function GET(request: NextRequest) {
  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 2. RATE LIMITING
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 120,
    message: 'Too many requests. Please slow down.'
  }, 'clients-search')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.toLowerCase() || ''
    const type = searchParams.get('type') || 'all' // 'company', 'contact', or 'all'

    if (!query || query.length < 1) {
      return NextResponse.json({ companies: [], contacts: [] })
    }

    const results: {
      companies: Array<{ id: string; name: string; contactCount: number }>
      contacts: Array<{ id: string; name: string; email: string | null; companyId: string; companyName: string }>
    } = {
      companies: [],
      contacts: []
    }

    // Search companies
    if (type === 'all' || type === 'company') {
      const companies = await prisma.clientCompany.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' }
        },
        include: {
          _count: { select: { contacts: true } }
        },
        take: 10,
        orderBy: { name: 'asc' }
      })

      results.companies = companies.map(c => ({
        id: c.id,
        name: c.name,
        contactCount: c._count.contacts
      }))
    }

    // Search contacts
    if (type === 'all' || type === 'contact') {
      const contacts = await prisma.clientContact.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } }
          ]
        },
        include: {
          company: true
        },
        take: 10,
        orderBy: { name: 'asc' }
      })

      results.contacts = contacts.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        companyId: c.companyId,
        companyName: c.company.name
      }))
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Failed to search clients:', error)
    return NextResponse.json({ error: 'Failed to search clients' }, { status: 500 })
  }
}
