import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'

// POST /api/clients/backfill - Backfill client directory from existing projects
export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const clientsMessages = messages?.clients || {}

  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 2. RATE LIMITING
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 5,
    message: clientsMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.'
  }, 'clients-backfill')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const stats = {
      companiesCreated: 0,
      contactsCreated: 0,
      projectsLinked: 0,
      skipped: 0
    }

    // Get all projects with company names or recipients
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { companyName: { not: null } },
          { recipients: { some: {} } }
        ]
      },
      include: {
        recipients: true
      }
    })

    for (const project of projects) {
      // Determine company name from project.companyName or primary recipient
      let companyName = project.companyName?.trim()
      
      if (!companyName) {
        // Try to get company name from primary recipient's name
        const primaryRecipient = project.recipients.find(r => r.isPrimary)
        if (primaryRecipient?.name) {
          companyName = primaryRecipient.name.trim()
        }
      }

      if (!companyName) {
        stats.skipped++
        continue
      }

      // Find or create company
      let company = await prisma.clientCompany.findUnique({
        where: { name: companyName }
      })

      if (!company) {
        company = await prisma.clientCompany.create({
          data: { name: companyName }
        })
        stats.companiesCreated++
      }

      // Create contacts from recipients
      for (const recipient of project.recipients) {
        if (!recipient.name && !recipient.email) continue

        // Check if contact already exists in this company
        const existingContact = await prisma.clientContact.findFirst({
          where: {
            companyId: company.id,
            OR: [
              recipient.email ? { email: recipient.email } : {},
              recipient.name ? { name: recipient.name } : {}
            ].filter(c => Object.keys(c).length > 0)
          }
        })

        if (!existingContact && recipient.name) {
          await prisma.clientContact.create({
            data: {
              companyId: company.id,
              name: recipient.name,
              email: recipient.email
            }
          })
          stats.contactsCreated++
        }
      }

      // Link project to company if not already linked
      if (!project.clientCompanyId) {
        await prisma.project.update({
          where: { id: project.id },
          data: { clientCompanyId: company.id }
        })
        stats.projectsLinked++
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      message: (clientsMessages.backfillCompleteSummary || 'Backfill complete: {companiesCreated} companies created, {contactsCreated} contacts created, {projectsLinked} projects linked, {skipped} skipped')
        .replace('{companiesCreated}', String(stats.companiesCreated))
        .replace('{contactsCreated}', String(stats.contactsCreated))
        .replace('{projectsLinked}', String(stats.projectsLinked))
        .replace('{skipped}', String(stats.skipped))
    })
  } catch (error) {
    console.error('Failed to backfill client directory:', error)
    return NextResponse.json({ error: clientsMessages.failedToBackfillClientDirectory || 'Failed to backfill client directory' }, { status: 500 })
  }
}
