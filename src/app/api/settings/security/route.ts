import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    let settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
    })

    if (!settings) {
      settings = await prisma.securitySettings.create({
        data: {
          id: 'default',
        },
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error fetching security settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch security settings' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const body = await request.json()

    const {
      hotlinkProtection,
      ipRateLimit,
      sessionRateLimit,
      passwordAttempts,
      trackAnalytics,
      trackSecurityLogs,
      viewSecurityEvents,
    } = body

    const settings = await prisma.securitySettings.upsert({
      where: { id: 'default' },
      update: {
        hotlinkProtection,
        ipRateLimit: ipRateLimit ? parseInt(ipRateLimit) : 1000,
        sessionRateLimit: sessionRateLimit ? parseInt(sessionRateLimit) : 600,
        passwordAttempts: passwordAttempts ? parseInt(passwordAttempts) : 5,
        trackAnalytics: trackAnalytics ?? true,
        trackSecurityLogs: trackSecurityLogs ?? true,
        viewSecurityEvents: viewSecurityEvents ?? false,
      },
      create: {
        id: 'default',
        hotlinkProtection,
        ipRateLimit: ipRateLimit ? parseInt(ipRateLimit) : 1000,
        sessionRateLimit: sessionRateLimit ? parseInt(sessionRateLimit) : 600,
        passwordAttempts: passwordAttempts ? parseInt(passwordAttempts) : 5,
        trackAnalytics: trackAnalytics ?? true,
        trackSecurityLogs: trackSecurityLogs ?? true,
        viewSecurityEvents: viewSecurityEvents ?? false,
      },
    })

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating security settings:', error)
    return NextResponse.json(
      { error: 'Failed to update security settings' },
      { status: 500 }
    )
  }
}
