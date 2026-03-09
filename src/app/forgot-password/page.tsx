'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Mail, CheckCircle2, AlertTriangle } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function ForgotPasswordPage() {
  const t = useTranslations('auth')
  const tc = useTranslations('common')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()

      if (res.ok) {
        setStatus('success')
        setMessage(data.message || t('resetEmailSent'))
        setEmail('')
      } else {
        setStatus('error')
        setMessage(data.error || t('somethingWrong'))
      }
    } catch (error) {
      setStatus('error')
      setMessage(t('unableToProcess'))
    }
  }

  return (
    <div className="flex-1 min-h-0 bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <BrandLogo height={64} className="mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-foreground">{tc('viTransfer')}</h1>
            <p className="text-sm text-muted-foreground mt-2">{tc('videoReviewTagline')}</p>
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                {t('forgotPasswordTitle')}
              </CardTitle>
              <CardDescription>
                {t('forgotPasswordDescription')}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {status === 'success' && (
                  <div className="p-3 bg-success-visible border-2 border-success-visible rounded-lg">
                    <p className="text-sm text-success font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      {message}
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
                  <Label htmlFor="email">{t('emailOrUsername')}</Label>
                  <Input
                    id="email"
                    type="text"
                    placeholder={t('emailOrUsernamePlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    autoFocus
                    disabled={status === 'loading' || status === 'success'}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={status === 'loading' || status === 'success'}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {status === 'loading' ? tc('sending') : t('sendResetLink')}
                </Button>

                <div className="text-center pt-4">
                  <Link href="/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    {t('backToLogin')}
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
