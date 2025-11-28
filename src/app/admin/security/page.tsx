'use client'

import SecurityEventsClient from './SecurityEventsClient'

/**
 * Security Events Dashboard
 * Only accessible when viewSecurityEvents is enabled in settings
 * Requires admin authentication
 */
export default function SecurityEventsPage() {
  return <SecurityEventsClient />
}
