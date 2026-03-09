'use client'

import { Globe } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

interface LocaleOption {
  code: string
  name: string
}

interface LanguageToggleProps {
  onChange?: (locale: string) => void
}

export default function LanguageToggle({ onChange }: LanguageToggleProps) {
  const [locale, setLocale] = useState<string>('en')
  const [availableLocales, setAvailableLocales] = useState<LocaleOption[]>([])
  const [mounted, setMounted] = useState(false)

  const fetchLanguageSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/language')
      if (response.ok) {
        const data = await response.json()
        setAvailableLocales(data.availableLocales || [])
        return data.defaultLanguage || 'en'
      }
    } catch {
      // Fallback
    }
    return 'en'
  }, [])

  useEffect(() => {
    setMounted(true)

    async function init() {
      const adminDefault = await fetchLanguageSettings()

      // Priority: localStorage > browser language > admin default
      const saved = localStorage.getItem('shareLanguage')
      if (saved) {
        setLocale(saved)
        onChange?.(saved)
        return
      }

      // Auto-detect from browser language
      const browserLang = navigator.language?.split('-')[0] || 'en'
      // Check if browser language is available
      const response = await fetch('/api/settings/language')
      if (response.ok) {
        const data = await response.json()
        const codes = (data.availableLocales || []).map((l: LocaleOption) => l.code)
        if (codes.includes(browserLang)) {
          setLocale(browserLang)
          onChange?.(browserLang)
          return
        }
      }

      // Fall back to admin default
      setLocale(adminDefault)
      onChange?.(adminDefault)
    }

    init()
  }, [fetchLanguageSettings, onChange])

  const cycleLanguage = () => {
    if (availableLocales.length <= 1) return

    const currentIndex = availableLocales.findIndex(l => l.code === locale)
    const nextIndex = (currentIndex + 1) % availableLocales.length
    const nextLocale = availableLocales[nextIndex].code

    setLocale(nextLocale)
    localStorage.setItem('shareLanguage', nextLocale)
    onChange?.(nextLocale)

    // Dispatch event for ShareLocaleProvider to pick up
    window.dispatchEvent(new CustomEvent('shareLocaleChange', { detail: nextLocale }))
  }

  // Don't render if only one locale available
  if (!mounted || availableLocales.length <= 1) {
    return null
  }

  const currentLocale = availableLocales.find(l => l.code === locale)
  const label = currentLocale?.code?.toUpperCase() || 'EN'

  return (
    <button
      onClick={cycleLanguage}
      className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors shadow-sm flex items-center gap-1.5"
      aria-label={`Language: ${currentLocale?.name || 'English'}`}
      title={currentLocale?.name || 'English'}
    >
      <Globe className="h-5 w-5 text-foreground" />
      <span className="text-xs font-medium text-foreground">{label}</span>
    </button>
  )
}
