'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, MailX, Video } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
    <div className="flex-1 min-h-0 bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
              <Video className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">ViTransfer</h1>
            <p className="text-sm text-muted-foreground mt-2">Video Review, Feedback & Deliverables</p>
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MailX className="w-5 h-5" />
                Email Preferences
              </CardTitle>
              <CardDescription>Unsubscribe from project email notifications.</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {!hasToken && (
                <div className="p-3 bg-warning-visible border-2 border-warning-visible rounded-lg">
                  <p className="text-sm text-warning font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    This unsubscribe link is missing or invalid. Please use the link from your email.
                  </p>
                </div>
              )}

              {status === 'success' && (
                <div className="p-3 bg-success-visible border-2 border-success-visible rounded-lg">
                  <p className="text-sm text-success font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    You’re unsubscribed from project email notifications.
                  </p>
                </div>
              )}

              {status === 'error' && (
                <div className="p-3 bg-destructive-visible border-2 border-destructive-visible rounded-lg">
                  <p className="text-sm text-destructive font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Something went wrong. Please try again.
                  </p>
                </div>
              )}

              <Button
                type="button"
                className="w-full"
                onClick={handleUnsubscribe}
                disabled={!hasToken || status === 'loading' || status === 'success'}
              >
                <MailX className="w-4 h-4 mr-2" />
                {status === 'loading' ? 'Unsubscribing…' : 'Unsubscribe'}
              </Button>

              <p className="text-xs text-muted-foreground">
                Stops email notifications only. Your share link still works.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
