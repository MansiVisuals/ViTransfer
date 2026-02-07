import { prisma } from './db'

/**
 * Sync a recipient to the client directory
 * - Creates company if project has companyName and it doesn't exist
 * - Creates contact if it doesn't exist in the company
 * - Links project to company if not already linked
 * 
 * This is called automatically when recipients are added/updated
 */
export async function syncRecipientToDirectory(
  projectId: string,
  recipientName: string | null,
  recipientEmail: string | null
): Promise<void> {
  // Skip if no name (can't create a meaningful contact without a name)
  if (!recipientName) return

  try {
    // Get project with company info
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        companyName: true,
        clientCompanyId: true,
        recipients: {
          where: { isPrimary: true },
          take: 1,
          select: { name: true }
        }
      }
    })

    if (!project) return

    // Determine company name: project.companyName OR primary recipient name
    const companyName = project.companyName?.trim() || 
      project.recipients[0]?.name?.trim() ||
      recipientName.trim()

    if (!companyName) return

    // Find or create the company
    let company = await prisma.clientCompany.findUnique({
      where: { name: companyName }
    })

    if (!company) {
      company = await prisma.clientCompany.create({
        data: { name: companyName }
      })
    }

    // Check if contact already exists in this company
    const existingContact = await prisma.clientContact.findFirst({
      where: {
        companyId: company.id,
        OR: [
          recipientEmail ? { email: recipientEmail } : { id: 'never-match' },
          { name: recipientName }
        ]
      }
    })

    // Create contact if it doesn't exist
    if (!existingContact) {
      await prisma.clientContact.create({
        data: {
          companyId: company.id,
          name: recipientName,
          email: recipientEmail
        }
      })
    } else if (recipientEmail && !existingContact.email) {
      // Update contact with email if we now have one
      await prisma.clientContact.update({
        where: { id: existingContact.id },
        data: { email: recipientEmail }
      })
    }

    // Link project to company if not already linked
    if (!project.clientCompanyId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { clientCompanyId: company.id }
      })
    }
  } catch (error) {
    // Log but don't throw - this is a background sync operation
    console.error('[ClientSync] Failed to sync recipient to directory:', error)
  }
}

/**
 * Sync project company name to client directory
 * Called when project companyName is updated
 */
export async function syncCompanyToDirectory(
  _projectId: string,
  companyName: string | null
): Promise<string | null> {
  if (!companyName?.trim()) return null

  try {
    const trimmedName = companyName.trim()

    // Find or create the company
    let company = await prisma.clientCompany.findUnique({
      where: { name: trimmedName }
    })

    if (!company) {
      company = await prisma.clientCompany.create({
        data: { name: trimmedName }
      })
    }

    return company.id
  } catch (error) {
    console.error('[ClientSync] Failed to sync company to directory:', error)
    return null
  }
}
