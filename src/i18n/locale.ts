import { prisma } from '@/lib/db'

export const SUPPORTED_LOCALES = ['en', 'nl', 'de'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  nl: 'Nederlands',
  de: 'Deutsch',
}

/**
 * Get the configured language from the database.
 * Falls back to 'en' if not set or on error.
 */
export async function getConfiguredLocale(): Promise<string> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { language: true },
    })
    return settings?.language || 'en'
  } catch {
    return 'en'
  }
}

/**
 * Load locale messages for server-side use (e.g., email templates).
 * Returns the full messages object for the given locale.
 */
export async function loadLocaleMessages(locale: string): Promise<Record<string, any>> {
  try {
    return (await import(`../locales/${locale}.json`)).default
  } catch {
    return (await import('../locales/en.json')).default
  }
}

