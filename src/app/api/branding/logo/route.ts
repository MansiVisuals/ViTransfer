import { NextResponse } from 'next/server'
import { getFilePath } from '@/lib/storage'
import fs from 'fs/promises'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STORAGE_PATH = 'branding/logo.svg'

export async function GET() {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const settingsMessages = messages?.settings || {}

  try {
    const filePath = getFilePath(STORAGE_PATH)
    const data = await fs.readFile(filePath)
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=300, must-revalidate',
      },
    })
  } catch {
    return NextResponse.json({ error: settingsMessages.logoNotFound || 'Logo not found' }, { status: 404 })
  }
}
