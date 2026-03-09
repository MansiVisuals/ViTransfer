import { NextRequest, NextResponse } from 'next/server'
import { SUPPORTED_LOCALES } from '@/i18n/locale'

export const runtime = 'nodejs'

/**
 * Public endpoint to get locale messages for client-side language switching.
 * No authentication required - share pages need this for dynamic locale loading.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const locale = searchParams.get('locale') || 'en'

  // Validate locale is supported
  if (!SUPPORTED_LOCALES.includes(locale as any)) {
    return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 })
  }

  try {
    const messages = (await import(`@/locales/${locale}.json`)).default
    return NextResponse.json({ locale, messages }, {
      headers: {
        // Cache for 5 minutes — locale files don't change at runtime
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch {
    // Fall back to English
    const messages = (await import('@/locales/en.json')).default
    return NextResponse.json({ locale: 'en', messages })
  }
}
