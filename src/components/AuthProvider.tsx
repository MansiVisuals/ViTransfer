'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/token-store'

interface User {
  id: string
  email: string
  name: string | null
  role: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: () => void
  logout: () => Promise<void>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
  isAuthenticated: false,
})

export function useAuth() {
  return useContext(AuthContext)
}

interface AuthProviderProps {
  children: ReactNode
  requireAuth?: boolean
}

export function AuthProvider({ children, requireAuth = false }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  async function checkAuth() {
    try {
      const response = await apiFetch('/api/auth/session')
      if (response.ok) {
        const data = await response.json()
        if (data.authenticated && data.user) {
          setUser(data.user)
          return
        }
      }
      setUser(null)
    } catch (error) {
      setUser(null)
    } finally{
      setLoading(false)
    }
  }

  useEffect(() => {
    bootstrap()
  }, [pathname])

  async function bootstrap() {
    setLoading(true)
    const refreshToken = getRefreshToken()
    const hasAccess = getAccessToken()

    if (!hasAccess && refreshToken) {
      await refreshWithToken(refreshToken)
    }

    await checkAuth()
  }

  useEffect(() => {
    if (requireAuth && !loading && !user) {
      router.push(`/login?returnUrl=${encodeURIComponent(pathname || '/')}`)
    }
  }, [requireAuth, loading, user, pathname, router])

  async function refreshWithToken(refreshToken: string) {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
      })
      if (!response.ok) {
        clearTokens()
        return false
      }

      const data = await response.json()
      if (data?.tokens?.accessToken && data?.tokens?.refreshToken) {
        setTokens({
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
        })
        return true
      }
      clearTokens()
      return false
    } catch (error) {
      clearTokens()
      return false
    }
  }

  /**
   * Secure Logout Function
   * 
   * Client-side logout procedure:
   * 1. Call POST /api/auth/logout with credentials
   * 2. Clear local application state immediately
   * 3. Clear any localStorage/sessionStorage (if used)
   * 4. Perform hard redirect to clear all cached state
   * 5. Handle errors gracefully (still logout locally)
   * 
   * Security considerations:
   */
  async function logout() {
    try {
      const refreshToken = getRefreshToken()
      const accessToken = getAccessToken()

      await fetch('/api/auth/logout', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(refreshToken ? { 'X-Refresh-Token': `Bearer ${refreshToken}` } : {}),
        },
        body: JSON.stringify({ refreshToken }),
      })
    } catch (error) {
      // Continue with local logout even if API call fails
    }

    // Step 2: Clear local application state immediately
    // Don't wait for server response - fail secure
    setUser(null)

    // Step 3: Clear any client-side storage (defense in depth)
    try {
      clearTokens()
      localStorage.removeItem('vitransfer_preferences')
      sessionStorage.clear()
    } catch (storageError) {
      // Storage might not be available in some contexts - silent fail
    }

    // Step 4: Hard redirect to login page
    // Using window.location.href instead of router.push because:
    // - Forces full page reload (clears all React state)
    // - Clears any cached authenticated pages
    // - Triggers middleware check immediately
    // - More reliable than soft navigation
    window.location.href = '/login'
  }

  function login() {
    router.push(`/login?returnUrl=${encodeURIComponent(pathname || '/')}`)
  }

  // SECURITY: Show loading state while checking auth OR when unauthenticated (before redirect)
  // This prevents content flash - NO content should render until auth is confirmed
  if (requireAuth && (loading || !user)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
