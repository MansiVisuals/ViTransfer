import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { SUPPORTED_LOCALES, LOCALE_NAMES } from '@/i18n/locale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public endpoint to get language settings for share pages
 * No authentication required - needed for client-side locale selection
 */
export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { language: true },
    })

    const defaultLanguage = settings?.language || 'en'
    const availableLocales = SUPPORTED_LOCALES.map(code => ({
      code,
      name: LOCALE_NAMES[code] || code,
    }))

    return NextResponse.json({
      defaultLanguage,
      availableLocales,
    })
  } catch {
    return NextResponse.json({
      defaultLanguage: 'en',
      availableLocales: [{ code: 'en', name: 'English' }],
    })
  }
}
