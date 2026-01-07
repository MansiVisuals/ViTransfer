import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import SharePageClient from './SharePageClient'

interface SharePageProps {
  params: Promise<{ token: string }>
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params

  // Server-side validation: check if slug exists and is not archived
  const project = await prisma.project.findUnique({
    where: { slug: token },
    select: { id: true, status: true },
  })

  // Show not-found for non-existent or archived projects
  // Archived projects appear as if they don't exist (security)
  if (!project || project.status === 'ARCHIVED') {
    notFound()
  }

  return <SharePageClient token={token} />
}
