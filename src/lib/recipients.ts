import { prisma } from './db'

export interface Recipient {
  id?: string
  email: string | null
  name: string | null
  isPrimary: boolean
  receiveNotifications: boolean
}

/**
 * Get all recipients for a project
 */
export async function getProjectRecipients(projectId: string): Promise<Recipient[]> {
  const recipients = await prisma.projectRecipient.findMany({
    where: { projectId },
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'asc' }
    ]
  })

  return recipients.map(r => ({
    id: r.id,
    email: r.email,
    name: r.name,
    isPrimary: r.isPrimary,
    receiveNotifications: r.receiveNotifications
  }))
}

/**
 * Get the primary recipient for a project
 */
export async function getPrimaryRecipient(projectId: string): Promise<Recipient | null> {
  const recipients = await getProjectRecipients(projectId)

  if (recipients.length === 0) {
    return null
  }

  // Return primary recipient if exists, otherwise first recipient
  return recipients.find(r => r.isPrimary) || recipients[0]
}

/**
 * Add a recipient to a project
 */
export async function addRecipient(
  projectId: string,
  email: string | null = null,
  name: string | null = null,
  isPrimary: boolean = false
): Promise<Recipient> {
  // If setting as primary, unset other primary recipients
  if (isPrimary) {
    await prisma.projectRecipient.updateMany({
      where: { projectId, isPrimary: true },
      data: { isPrimary: false }
    })
  }

  const recipient = await prisma.projectRecipient.create({
    data: {
      projectId,
      email,
      name,
      isPrimary
    }
  })

  return {
    id: recipient.id,
    email: recipient.email,
    name: recipient.name,
    isPrimary: recipient.isPrimary,
    receiveNotifications: recipient.receiveNotifications
  }
}

/**
 * Update a recipient
 */
export async function updateRecipient(
  recipientId: string,
  data: { name?: string | null; email?: string | null; isPrimary?: boolean; receiveNotifications?: boolean }
): Promise<Recipient> {
  // If setting as primary, get projectId and unset other primaries
  if (data.isPrimary) {
    const existing = await prisma.projectRecipient.findUnique({
      where: { id: recipientId },
      select: { projectId: true }
    })

    if (existing) {
      await prisma.projectRecipient.updateMany({
        where: {
          projectId: existing.projectId,
          isPrimary: true,
          id: { not: recipientId }
        },
        data: { isPrimary: false }
      })
    }
  }

  const recipient = await prisma.projectRecipient.update({
    where: { id: recipientId },
    data
  })

  return {
    id: recipient.id,
    email: recipient.email,
    name: recipient.name,
    isPrimary: recipient.isPrimary,
    receiveNotifications: recipient.receiveNotifications
  }
}

/**
 * Delete a recipient
 */
export async function deleteRecipient(recipientId: string): Promise<void> {
  // Fetch recipient with isPrimary status BEFORE deleting
  const recipient = await prisma.projectRecipient.findUnique({
    where: { id: recipientId },
    select: { projectId: true, isPrimary: true }
  })

  if (!recipient) {
    throw new Error('Recipient not found')
  }

  // Delete the recipient
  await prisma.projectRecipient.delete({
    where: { id: recipientId }
  })

  // If deleted recipient WAS primary, promote another recipient to primary
  if (recipient.isPrimary) {
    const remaining = await prisma.projectRecipient.findFirst({
      where: { projectId: recipient.projectId },
      orderBy: { createdAt: 'asc' }
    })

    if (remaining) {
      await prisma.projectRecipient.update({
        where: { id: remaining.id },
        data: { isPrimary: true }
      })
    }
  }
}
