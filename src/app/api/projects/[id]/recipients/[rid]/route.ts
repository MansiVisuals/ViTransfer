import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { updateRecipient, deleteRecipient } from '@/lib/recipients'
import { z } from 'zod'

const updateRecipientSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().email('Invalid email format').nullable().optional(),
  isPrimary: z.boolean().optional()
}).refine(data => {
  // If email is provided (not null or undefined), validate it
  if (data.email !== null && data.email !== undefined && data.email !== '') {
    return data.email.includes('@')
  }
  return true
}, {
  message: 'Invalid email format'
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { rid: recipientId } = await params
    const body = await request.json()

    // Validate input
    const validation = updateRecipientSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      )
    }

    const recipient = await updateRecipient(recipientId, validation.data)

    return NextResponse.json({ recipient })
  } catch (error: any) {
    console.error('Failed to update recipient:', error)

    if (error.message === 'Recipient not found') {
      return NextResponse.json(
        { error: 'Recipient not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update recipient' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { rid: recipientId } = await params

    await deleteRecipient(recipientId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to delete recipient:', error)

    if (error.message === 'Recipient not found') {
      return NextResponse.json(
        { error: 'Recipient not found' },
        { status: 404 }
      )
    }

    if (error.message === 'Cannot delete the last recipient') {
      return NextResponse.json(
        { error: 'Cannot delete the last recipient. At least one recipient is required.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to delete recipient' },
      { status: 500 }
    )
  }
}
