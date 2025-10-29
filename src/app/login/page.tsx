'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Lock, Video, LogIn } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnUrl = searchParams?.get('returnUrl') || '/admin'
  const sessionExpired = searchParams?.get('sessionExpired') === 'true'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      // Success - redirect to return URL or admin
      router.push(returnUrl)
      router.refresh()
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
            <Video className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            ViTransfer
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Professional Video Review & Share Platform
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Admin Login
            </CardTitle>
            <CardDescription>
              Sign in to access the admin dashboard
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {sessionExpired && (
                <div className="p-3 bg-warning-visible border-2 border-warning-visible rounded-lg">
                  <p className="text-sm text-warning font-medium">
                    Your session has expired due to inactivity. Please log in again.
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3 bg-destructive-visible border-2 border-destructive-visible rounded-lg">
                  <p className="text-sm text-destructive font-medium">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Username or Email</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="Enter your username or email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  autoFocus
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                variant="default"
                size="default"
                className="w-full"
                disabled={loading}
              >
                <LogIn className="w-4 h-4 mr-2" />
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
            <Video className="w-8 h-8 text-primary-foreground animate-pulse" />
          </div>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
