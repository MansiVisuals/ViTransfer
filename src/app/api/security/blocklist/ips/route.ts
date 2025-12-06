import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { invalidateBlocklistCache } from '@/lib/video-access'
export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/security/blocklist/ips
 *
 * Get all blocked IP addresses
 * ADMIN ONLY
 */
export async function GET(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const blockedIPs = await prisma.blockedIP.findMany({
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      blockedIPs,
      count: blockedIPs.length,
    })
  } catch (error) {
    console.error('Error fetching blocked IPs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch blocked IPs' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/security/blocklist/ips
 *
 * Add IP address to blocklist
 * ADMIN ONLY
 */
export async function POST(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const body = await request.json()
    const { ipAddress, reason } = body

    if (!ipAddress || typeof ipAddress !== 'string') {
      return NextResponse.json(
        { error: 'IP address is required' },
        { status: 400 }
      )
    }

    // Basic IP validation
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/
    if (!ipPattern.test(ipAddress)) {
      return NextResponse.json(
        { error: 'Invalid IP address format' },
        { status: 400 }
      )
    }

    // Check if already blocked
    const existing = await prisma.blockedIP.findUnique({
      where: { ipAddress }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'IP address already blocked' },
        { status: 409 }
      )
    }

    const blockedIP = await prisma.blockedIP.create({
      data: {
        ipAddress,
        reason: reason || null,
        createdBy: authResult.id,
      }
    })

    // Invalidate cache
    await invalidateBlocklistCache()

    return NextResponse.json({
      success: true,
      blockedIP,
    })
  } catch (error) {
    console.error('Error blocking IP:', error)
    return NextResponse.json(
      { error: 'Failed to block IP address' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/security/blocklist/ips
 *
 * Remove IP address from blocklist
 * ADMIN ONLY
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const body = await request.json()
    const { id } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      )
    }

    await prisma.blockedIP.delete({
      where: { id }
    })

    // Invalidate cache
    await invalidateBlocklistCache()

    return NextResponse.json({
      success: true,
      message: 'IP address unblocked successfully',
    })
  } catch (error) {
    console.error('Error unblocking IP:', error)
    return NextResponse.json(
      { error: 'Failed to unblock IP address' },
      { status: 500 }
    )
  }
}
