'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'

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
      // Use native fetch for session check to avoid circular redirect
      // The session endpoint returns 401 for unauthenticated, which is expected
      const response = await fetch('/api/auth/session', {
        credentials: 'include',
      })
      const data = await response.json()

      if (data.authenticated && data.user) {
        setUser(data.user)
      } else {
        setUser(null)
        // Middleware will handle redirect to /login
      }
    } catch (error) {
      setUser(null)
    } finally{
      setLoading(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [pathname])

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
   * - Uses fetch with credentials: 'include' to send HttpOnly cookies
   * - Hard redirect (window.location.href) clears all cached state
   * - Local state cleared immediately (don't wait for server response)
   * - Graceful degradation: even if API fails, user is logged out locally
   */
  async function logout() {
    try {
      // Step 1: Call secure logout endpoint
      // This will:
      // - Revoke tokens in Redis blacklist
      // - Delete HttpOnly cookies
      // - Return 204 No Content
      const response = await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include', // Include HttpOnly cookies
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Continue if logout failed - local logout always proceeds
    } catch (error) {
      // Continue with local logout even if API call fails
    }

    // Step 2: Clear local application state immediately
    // Don't wait for server response - fail secure
    setUser(null)

    // Step 3: Clear any client-side storage (defense in depth)
    // Even though we use HttpOnly cookies, clear any other stored data
    try {
      // Clear localStorage (if any app data is stored there)
      localStorage.removeItem('vitransfer_preferences') // Example
      
      // Clear sessionStorage
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

  // Show loading state while checking auth
  if (loading && requireAuth) {
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
