'use client'

import { createContext, useContext } from 'react'

export type StorageProvider = 'local' | 's3'

// Context used to pass the value from server to client during SSR hydration.
const StorageConfigContext = createContext<StorageProvider>('local')

export function StorageConfigProvider({
  provider,
  children,
}: {
  provider: StorageProvider
  children: React.ReactNode
}) {
  return (
    <StorageConfigContext.Provider value={provider}>
      {children}
    </StorageConfigContext.Provider>
  )
}

declare global {
  interface Window { __STORAGE_PROVIDER__?: StorageProvider }
}

/**
 * Returns the active storage provider.
 *
 * The server sets `window.__STORAGE_PROVIDER__` via an inline script in layout.tsx
 * before any JS hydrates, so the value is available immediately and is not subject
 * to React context tree boundaries or hydration timing issues.
 * Falls back to the React context value during SSR (when window is undefined).
 */
export function useStorageProvider(): StorageProvider {
  const contextValue = useContext(StorageConfigContext)
  return (typeof window !== 'undefined' ? window.__STORAGE_PROVIDER__ : undefined) ?? contextValue
}
