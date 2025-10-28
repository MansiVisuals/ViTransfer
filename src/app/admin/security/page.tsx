import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import SecurityEventsClient from './SecurityEventsClient'

export const dynamic = 'force-dynamic'

/**
 * Security Events Dashboard
 * Only accessible when viewSecurityEvents is enabled in settings
 * Requires admin authentication
 */
export default async function SecurityEventsPage() {
  // Check authentication
  const user = await getCurrentUser()

  if (!user || user.role !== 'ADMIN') {
    redirect('/login')
  }

  // Check if security events viewing is enabled
  const settings = await prisma.securitySettings.findUnique({
    where: { id: 'default' },
    select: { viewSecurityEvents: true }
  })

  if (!settings?.viewSecurityEvents) {
    // Redirect to settings if not enabled
    redirect('/admin/settings')
  }

  return <SecurityEventsClient />
}
