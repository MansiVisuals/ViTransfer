'use client'

import { useParams } from 'next/navigation'
import AnalyticsClient from './AnalyticsClient'

export default function ProjectAnalyticsPage() {
  const params = useParams()

  if (!params?.id) {
    return null
  }

  const id = params.id as string

  return <AnalyticsClient id={id} />
}
