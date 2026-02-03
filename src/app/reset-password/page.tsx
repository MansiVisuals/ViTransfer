'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Lock, CheckCircle2, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  // Extract token from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#token=')) {
      const tokenFromHash = decodeURIComponent(hash.substring(7))
      setToken(tokenFromHash)
    } else {
      setStatus('error')
      setMessage('Invalid or missing reset token. Please request a new password reset link.')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      setStatus('error')
      setMessage('Passwords do not match.')
      return
    }

    if (password.length < 12) {
      setStatus('error')
      setMessage('Password must be at least 12 characters long.')
      return
    }

    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (res.ok) {
        setStatus('success')
        setMessage(data.message || 'Password has been reset successfully.')
        setPassword('')
        setConfirmPassword('')
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      } else {
        setStatus('error')
        setMessage(data.error || 'Failed to reset password. Please try again or request a new reset link.')
      }
    } catch (error) {
      setStatus('error')
      setMessage('Unable to process your request. Please try again.')
    }
  }

  return (
    <div className="flex-1 min-h-0 bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <BrandLogo height={64} className="mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-foreground">ViTransfer</h1>
            <p className="text-sm text-muted-foreground mt-2">Video Review, Feedback & Deliverables</p>
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Reset Password
              </CardTitle>
              <CardDescription>
                Create a new password for your account.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!token && status === 'error' ? (
                <div className="space-y-4">
                  <div className="p-3 bg-destructive-visible border-2 border-destructive-visible rounded-lg">
                    <p className="text-sm text-destructive font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      {message}
                    </p>
                  </div>
                  <div className="text-center pt-4">
                    <Link href="/forgot-password" className="inline-flex items-center text-sm text-primary hover:underline">
                      Request a new reset link
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {status === 'success' && (
                    <div className="p-3 bg-success-visible border-2 border-success-visible rounded-lg">
                      <p className="text-sm text-success font-medium flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        {message}
                      </p>
                      <p className="text-xs text-success mt-1">
                        Redirecting to login page...
                      </p>
                    </div>
                  )}

                  {status === 'error' && (
                    <div className="p-3 bg-destructive-visible border-2 border-destructive-visible rounded-lg">
                      <p className="text-sm text-destructive font-medium flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        {message}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="password">New Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter new password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        autoFocus
                        disabled={status === 'loading' || status === 'success'}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must be at least 12 characters with uppercase, lowercase, number, and special character.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        disabled={status === 'loading' || status === 'success'}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={status === 'loading' || status === 'success' || !token}
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    {status === 'loading' ? 'Resetting...' : 'Reset Password'}
                  </Button>

                  {status !== 'success' && (
                    <div className="text-center pt-4">
                      <Link href="/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Back to Login
                      </Link>
                    </div>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
