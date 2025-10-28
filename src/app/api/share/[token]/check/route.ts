import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'

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

    // Check if already authenticated
    const cookieStore = await cookies()
    const authToken = cookieStore.get(`share_auth_${project.id}`)
    const isAuthenticated = authToken?.value === 'true'

    return NextResponse.json({
      requiresPassword,
      isAuthenticated: !requiresPassword || isAuthenticated,
    })
  } catch (error) {
    console.error('Error checking auth:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
