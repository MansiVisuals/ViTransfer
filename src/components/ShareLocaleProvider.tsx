'use client'

import { useState, useEffect, useCallback } from 'react'
import { NextIntlClientProvider } from 'next-intl'

interface ShareLocaleProviderProps {
  children: React.ReactNode
}

/**
 * Provides a separate locale context for the share page.
 * Loads messages dynamically when the client toggles language.
 * Falls back to the server-rendered messages until client-side override kicks in.
 */
export default function ShareLocaleProvider({ children }: ShareLocaleProviderProps) {
  const [locale, setLocale] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, any> | null>(null)

  const loadMessages = useCallback(async (lang: string) => {
    try {
      const response = await fetch(`/api/settings/language/messages?locale=${lang}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages)
        setLocale(lang)
      }
    } catch {
      // Keep current messages on error
    }
  }, [])

  // Listen for locale changes from LanguageToggle
  useEffect(() => {
    const handleLocaleChange = (e: CustomEvent<string>) => {
      loadMessages(e.detail)
    }

    window.addEventListener('shareLocaleChange', handleLocaleChange as EventListener)
    return () => window.removeEventListener('shareLocaleChange', handleLocaleChange as EventListener)
  }, [loadMessages])

  // Initial load: check localStorage for saved preference
  useEffect(() => {
    const saved = localStorage.getItem('shareLanguage')
    if (saved) {
      loadMessages(saved)
    }
  }, [loadMessages])

  // If we have client-side overridden messages, wrap with a new provider
  if (locale && messages) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    )
  }

  // Before override: render children with the server-provided locale (from root layout)
  return <>{children}</>
}
