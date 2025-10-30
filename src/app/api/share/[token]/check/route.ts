import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { getRedis } from '@/lib/video-access'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const project = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
        sharePassword: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const requiresPassword = !!project.sharePassword

    // Check if there's a valid admin session - admins bypass password protection
    const adminUser = await getCurrentUserFromRequest(request)
    const isAdmin = adminUser?.role === 'ADMIN'

    // Check if already authenticated via share password
    const cookieStore = await cookies()
    const authSessionId = cookieStore.get('share_auth')?.value
    let isShareAuthenticated = false

    if (authSessionId) {
      // Verify auth session maps to this project
      const redis = getRedis()
      const mappedProjectId = await redis.get(`auth_project:${authSessionId}`)
      isShareAuthenticated = mappedProjectId === project.id
    }

    return NextResponse.json({
      requiresPassword,
      isAuthenticated: !requiresPassword || isShareAuthenticated || isAdmin,
      isAdmin, // Let frontend know this is an admin session
    })
  } catch (error) {
    console.error('Error checking auth:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
