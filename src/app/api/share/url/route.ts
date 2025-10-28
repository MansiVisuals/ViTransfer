import { NextRequest, NextResponse } from 'next/server'
import { generateShareUrl } from '@/lib/url'
import { requireApiAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  // Check authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const shareUrl = await generateShareUrl(slug, request)

    return NextResponse.json({ shareUrl })
  } catch (error) {
    console.error('Error generating share URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate share URL' },
      { status: 500 }
    )
  }
}
