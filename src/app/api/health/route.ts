import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRedis } from '@/lib/redis'
export const runtime = 'nodejs'




// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * Health Check Endpoint
 *
 * Public endpoint for Docker health checks and monitoring systems
 * Returns minimal information - only service availability status
 *
 * SECURITY: No authentication required (needed for health checks)
 * SECURITY: No sensitive information exposed (no version, config, etc.)
 * SECURITY: Rate limiting not applied (health checks need to be reliable)
 */
export async function GET() {
  try {
    // Quick database connectivity check
    await prisma.$queryRaw`SELECT 1`

    // Quick Redis connectivity check
    const redis = getRedis()
    await redis.ping()

    // All checks passed
    return NextResponse.json(
      { status: 'ok' },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    )
  } catch (error) {
    // Service unhealthy - return 503 Service Unavailable
    return NextResponse.json(
      { status: 'error' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    )
  }
}
