import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { invalidateBlocklistCache } from '@/lib/video-access'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/security/blocklist/domains
 *
 * Get all blocked domains
 * ADMIN ONLY
 */
export async function GET(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const settingsMessages = messages?.settings || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const blockedDomains = await prisma.blockedDomain.findMany({
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      blockedDomains,
      count: blockedDomains.length,
    })
  } catch (error) {
    logError('Error fetching blocked domains:', error)
    return NextResponse.json(
      { error: settingsMessages.failedToFetchBlockedDomains || 'Failed to fetch blocked domains' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/security/blocklist/domains
 *
 * Add domain to blocklist
 * ADMIN ONLY
 */
export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const settingsMessages = messages?.settings || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const body = await request.json()
    const { domain, reason } = body

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json(
        { error: settingsMessages.domainRequired || 'Domain is required' },
        { status: 400 }
      )
    }

    // Basic domain validation
    const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
    if (!domainPattern.test(domain)) {
      return NextResponse.json(
        { error: settingsMessages.invalidDomainFormat || 'Invalid domain format' },
        { status: 400 }
      )
    }

    // Normalize domain (lowercase)
    const normalizedDomain = domain.toLowerCase()

    // Check if already blocked
    const existing = await prisma.blockedDomain.findUnique({
      where: { domain: normalizedDomain }
    })

    if (existing) {
      return NextResponse.json(
        { error: settingsMessages.domainAlreadyBlocked || 'Domain already blocked' },
        { status: 409 }
      )
    }

    const blockedDomain = await prisma.blockedDomain.create({
      data: {
        domain: normalizedDomain,
        reason: reason || null,
        createdBy: authResult.id,
      }
    })

    // Invalidate cache
    await invalidateBlocklistCache()

    return NextResponse.json({
      success: true,
      blockedDomain,
    })
  } catch (error) {
    logError('Error blocking domain:', error)
    return NextResponse.json(
      { error: settingsMessages.failedToBlockDomain || 'Failed to block domain' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/security/blocklist/domains
 *
 * Remove domain from blocklist
 * ADMIN ONLY
 */
export async function DELETE(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const settingsMessages = messages?.settings || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const body = await request.json()
    const { id } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: settingsMessages.idRequired || 'ID is required' },
        { status: 400 }
      )
    }

    await prisma.blockedDomain.delete({
      where: { id }
    })

    // Invalidate cache
    await invalidateBlocklistCache()

    return NextResponse.json({
      success: true,
      message: settingsMessages.domainUnblockedSuccessfully || 'Domain unblocked successfully',
    })
  } catch (error) {
    logError('Error unblocking domain:', error)
    return NextResponse.json(
      { error: settingsMessages.failedToUnblockDomain || 'Failed to unblock domain' },
      { status: 500 }
    )
  }
}
