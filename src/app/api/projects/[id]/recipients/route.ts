import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { getProjectRecipients, addRecipient } from '@/lib/recipients'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
export const runtime = 'nodejs'




const addRecipientSchema = z.object({
  email: z.string().email('Invalid email format').nullable().optional(),
  name: z.string().nullable().optional(),
  isPrimary: z.boolean().optional().default(false)
}).refine(data => data.email || data.name, {
  message: 'At least one of email or name must be provided'
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: 60 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
  }, 'recipients-read')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id: projectId } = await params
    const recipients = await getProjectRecipients(projectId)

    return NextResponse.json({ recipients })
  } catch (error) {
    console.error('Failed to fetch recipients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recipients' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { id: projectId } = await params
    const body = await request.json()

    // Validate input
    const validation = addRecipientSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      )
    }

    const { email, name = null, isPrimary = false } = validation.data

    // Add recipient
    const recipient = await addRecipient(projectId, email, name, isPrimary)

    return NextResponse.json({ recipient }, { status: 201 })
  } catch (error: any) {
    console.error('Failed to add recipient:', error)

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'This email is already added to the project' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to add recipient' },
      { status: 500 }
    )
  }
}
