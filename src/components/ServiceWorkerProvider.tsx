'use client'

import { useEffect } from 'react'

/**
 * ServiceWorkerProvider registers the service worker for PWA functionality.
 * Place this component in your layout to enable push notifications.
 */
export function ServiceWorkerProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) {
      console.log('[SW] Service workers not supported')
      return
    }

    // Register service worker
    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        console.log('[SW] Service worker registered:', registration.scope)

        // Check for updates periodically
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available
                console.log('[SW] New service worker available')
              }
            })
          }
        })
      } catch (error) {
        console.error('[SW] Service worker registration failed:', error)
      }
    }

    // Register on load
    if (document.readyState === 'complete') {
      registerServiceWorker()
    } else {
      window.addEventListener('load', registerServiceWorker)
      return () => window.removeEventListener('load', registerServiceWorker)
    }
  }, [])

  // This component doesn't render anything
  return null
}
