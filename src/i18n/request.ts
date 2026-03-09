import { getRequestConfig } from 'next-intl/server'
import { prisma } from '@/lib/db'

export default getRequestConfig(async () => {
  let locale = 'en'

  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { language: true },
    })
    if (settings?.language) {
      locale = settings.language
    }
  } catch {
    // Fall back to English if DB unavailable
  }

  let messages
  try {
    messages = (await import(`../locales/${locale}.json`)).default
  } catch {
    // Fall back to English if locale file missing
    messages = (await import('../locales/en.json')).default
  }

  return {
    locale,
    messages,
  }
})
