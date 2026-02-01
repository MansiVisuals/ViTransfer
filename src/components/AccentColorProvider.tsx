'use client'

import { useEffect } from 'react'
import { ACCENT_COLORS, AccentColorKey } from '@/components/settings/AppearanceSection'

/**
 * Applies the accent color CSS variables and caches admin theme defaults
 * Fetches from API and caches in localStorage for faster subsequent loads
 */
export function AccentColorProvider() {
  useEffect(() => {
    applyAppearanceSettings()
  }, [])

  const applyAppearanceSettings = async () => {
    try {
      // Fetch current setting from API
      const response = await fetch('/api/settings/theme')
      if (response.ok) {
        const data = await response.json()
        const colorKey = (data.accentColor || 'blue') as AccentColorKey
        const defaultTheme = data.defaultTheme || 'auto'

        // Cache both values for faster loads on subsequent visits
        localStorage.setItem('adminAccentColor', colorKey)
        localStorage.setItem('adminDefaultTheme', defaultTheme)

        // Apply the accent color
        applyColorVariables(colorKey)

        // Apply theme if user hasn't set a preference
        const userTheme = localStorage.getItem('theme')
        if (!userTheme) {
          applyDefaultTheme(defaultTheme)
        }
      } else {
        // API failed, use cached values
        const cachedColor = localStorage.getItem('adminAccentColor') as AccentColorKey | null
        if (cachedColor) {
          applyColorVariables(cachedColor)
        }
      }
    } catch {
      // On error, try cached value
      const cachedColor = localStorage.getItem('adminAccentColor') as AccentColorKey | null
      if (cachedColor) {
        applyColorVariables(cachedColor)
      }
    }
  }

  const applyDefaultTheme = (defaultTheme: string) => {
    const root = document.documentElement

    if (defaultTheme === 'dark') {
      root.classList.add('dark')
    } else if (defaultTheme === 'light') {
      root.classList.remove('dark')
    } else {
      // 'auto' - use system preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }

  const applyColorVariables = (colorKey: AccentColorKey) => {
    const color = ACCENT_COLORS[colorKey]
    if (!color) return

    const root = document.documentElement
    const isDark = root.classList.contains('dark')

    // Apply the primary color based on current theme
    const hslValue = isDark ? color.dark : color.light
    root.style.setProperty('--primary', hslValue)
    root.style.setProperty('--ring', hslValue)

    // Calculate visible background (lighter version for badges/highlights)
    const [h, s] = hslValue.split(' ')
    const visibleLight = `${h} ${s} 95%`
    const visibleDark = `${h} ${s} 20%`
    root.style.setProperty('--primary-visible', isDark ? visibleDark : visibleLight)

    // Update accent-foreground to match primary
    root.style.setProperty('--accent-foreground', hslValue)

    // Listen for theme changes to update colors
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isDarkNow = root.classList.contains('dark')
          const hslValueNow = isDarkNow ? color.dark : color.light
          root.style.setProperty('--primary', hslValueNow)
          root.style.setProperty('--ring', hslValueNow)
          root.style.setProperty('--accent-foreground', hslValueNow)

          const [hNow, sNow] = hslValueNow.split(' ')
          root.style.setProperty('--primary-visible', isDarkNow ? `${hNow} ${sNow} 20%` : `${hNow} ${sNow} 95%`)
        }
      })
    })

    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
  }

  return null
}
