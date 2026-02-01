'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // Check if user has a saved preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null

    if (savedTheme) {
      // User has manually set a preference - use it
      setTheme(savedTheme)
      applyTheme(savedTheme)
    } else {
      // No saved preference - fetch admin default and apply
      fetchAndApplyDefaultTheme()
    }

    // Listen for system preference changes (when user changes OS theme)
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if user hasn't set a manual preference AND admin default is 'auto'
      if (!localStorage.getItem('theme')) {
        const adminDefault = localStorage.getItem('adminDefaultTheme')
        if (!adminDefault || adminDefault === 'auto') {
          const newTheme = e.matches ? 'dark' : 'light'
          setTheme(newTheme)
          applyTheme(newTheme)
        }
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const applyTheme = (themeToApply: 'light' | 'dark') => {
    if (themeToApply === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const fetchAndApplyDefaultTheme = async () => {
    try {
      // Check if we already have a cached admin default
      const cachedDefault = localStorage.getItem('adminDefaultTheme')

      // Fetch the current admin default
      const response = await fetch('/api/settings/theme')
      if (response.ok) {
        const data = await response.json()
        const adminDefault = data.defaultTheme || 'auto'

        // Cache the admin default for future page loads
        localStorage.setItem('adminDefaultTheme', adminDefault)

        // Determine which theme to use
        let themeToUse: 'light' | 'dark'
        if (adminDefault === 'auto') {
          // Use system preference
          themeToUse = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        } else {
          themeToUse = adminDefault as 'light' | 'dark'
        }

        setTheme(themeToUse)
        applyTheme(themeToUse)
      } else if (cachedDefault) {
        // API failed, use cached default
        let themeToUse: 'light' | 'dark'
        if (cachedDefault === 'auto') {
          themeToUse = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        } else {
          themeToUse = cachedDefault as 'light' | 'dark'
        }
        setTheme(themeToUse)
        applyTheme(themeToUse)
      } else {
        // No cached default and API failed - fall back to system preference
        const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        setTheme(systemPreference)
        applyTheme(systemPreference)
      }
    } catch {
      // On error, fall back to system preference
      const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      setTheme(systemPreference)
      applyTheme(systemPreference)
    }
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    // Save user's manual preference
    localStorage.setItem('theme', newTheme)

    // Apply/remove dark class properly
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // Avoid hydration mismatch
  if (!mounted) {
    return (
      <button
        className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors shadow-sm"
        aria-label="Toggle theme"
      >
        <div className="h-5 w-5" />
      </button>
    )
  }

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors shadow-sm"
      aria-label="Toggle theme"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Moon className="h-5 w-5 text-foreground" />
      ) : (
        <Sun className="h-5 w-5 text-foreground" />
      )}
    </button>
  )
}
