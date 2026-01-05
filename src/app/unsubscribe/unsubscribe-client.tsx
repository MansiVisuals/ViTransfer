'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function UnsubscribeClient({ token }: { token: string }) {
  const [effectiveToken, setEffectiveToken] = useState(token)
  const hasToken = useMemo(() => effectiveToken.trim().length > 0, [effectiveToken])
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    function readTokenFromHash(): string {
      if (typeof window === 'undefined') return ''
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
      const params = new URLSearchParams(hash)
      return params.get('token') || ''
    }

    const hashToken = readTokenFromHash()
    if (hashToken) {
      setEffectiveToken(hashToken)
      return
    }

    setEffectiveToken(token)
  }, [token])

  async function handleUnsubscribe() {
    if (!hasToken) return

    setStatus('loading')
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: effectiveToken }),
      })

      if (!res.ok) {
        setStatus('error')
        return
      }

      setStatus('success')
      try {
        window.history.replaceState(null, '', '/unsubscribe')
      } catch {
        // Ignore
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email Preferences</CardTitle>
          <CardDescription>Unsubscribe from project update emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasToken && (
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
              <div>
                This unsubscribe link is missing or invalid. Please use the link from your email.
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
              <div>You’re unsubscribed from project update emails.</div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
              <div>Something went wrong. Please try again.</div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1"
              onClick={handleUnsubscribe}
              disabled={!hasToken || status === 'loading' || status === 'success'}
            >
              {status === 'loading' ? 'Unsubscribing…' : 'Unsubscribe'}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/">Close</Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Stops email updates only. Your access link still works.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
