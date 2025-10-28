import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRedis } from '@/lib/video-access'
import { existsSync } from 'fs'
import { getFilePath } from '@/lib/storage'

/**
 * Health check endpoint for monitoring
 * Returns 200 OK only if all critical services are operational
 */
export async function GET() {
  const checks: Record<string, { status: string; message?: string }> = {}

  // Check 1: Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'healthy' }
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      message: 'Database connection failed'
    }
  }

  // Check 2: Redis connectivity
  try {
    const redis = getRedis()
    await redis.ping()
    checks.redis = { status: 'healthy' }
  } catch (error) {
    checks.redis = {
      status: 'unhealthy',
      message: 'Redis connection failed'
    }
  }

  // Check 3: Storage accessibility
  try {
    const storagePath = getFilePath('')
    if (existsSync(storagePath)) {
      checks.storage = { status: 'healthy' }
    } else {
      checks.storage = {
        status: 'unhealthy',
        message: 'Storage directory not accessible'
      }
    }
  } catch (error) {
    checks.storage = {
      status: 'unhealthy',
      message: 'Storage check failed'
    }
  }

  // Determine overall health
  const allHealthy = Object.values(checks).every(check => check.status === 'healthy')

  const response = {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
  }

  return NextResponse.json(
    response,
    { status: allHealthy ? 200 : 503 }
  )
}
