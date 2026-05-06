'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Mail } from 'lucide-react'

interface Props {
  onSubmitted: (email: string) => void
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function PortalLogin({ onSubmitted }: Props) {
  const t = useTranslations('portal')
  const tc = useTranslations('common')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!EMAIL_REGEX.test(email)) {
      setError(t('invalidEmail'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/portal/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        onSubmitted(email)
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data?.error || tc('errorTryAgain'))
    } catch {
      setError(tc('errorTryAgain'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-card border-border w-full">
      <CardHeader className="text-center space-y-3">
        <div className="flex justify-center">
          <Mail className="w-12 h-12 text-muted-foreground" />
        </div>
        <CardTitle className="text-foreground">{t('title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="portal-email" className="text-sm font-medium text-foreground">
              {t('emailLabel')}
            </label>
            <Input
              id="portal-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}
          <Button type="submit" disabled={loading || !email} className="w-full">
            {loading ? t('sending') : t('submit')}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center pt-2">
          {t('dontHaveAccess')}
        </p>
      </CardContent>
    </Card>
  )
}
