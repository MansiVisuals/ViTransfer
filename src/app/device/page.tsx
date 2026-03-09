'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Monitor, Fingerprint, LogIn, CheckCircle2, XCircle } from 'lucide-react'
import { startAuthentication } from '@simplewebauthn/browser'
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { getAccessToken, setTokens } from '@/lib/token-store'
import BrandLogo from '@/components/BrandLogo'
import { useTranslations } from 'next-intl'

type FlowStep = 'authenticate' | 'authorize' | 'success' | 'error'

function DeviceAuthForm() {
  const t = useTranslations('device')
  const ta = useTranslations('auth')
  const tc = useTranslations('common')
  const searchParams = useSearchParams()
  const codeFromUrl = searchParams?.get('code') || ''

  const [step, setStep] = useState<FlowStep>('authenticate')
  const [userCode, setUserCode] = useState(codeFromUrl)
  const [error, setError] = useState('')

  // Auth form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [authorizeLoading, setAuthorizeLoading] = useState(false)

  // Check if user is already authenticated
  useEffect(() => {
    const token = getAccessToken()
    if (token) {
      setStep('authorize')
    }
  }, [])

  async function handlePasskeyLogin() {
    setError('')
    setPasskeyLoading(true)

    try {
      const optionsRes = await fetch('/api/auth/passkey/authenticate/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!optionsRes.ok) {
        const data = await optionsRes.json()
        throw new Error(data.error || ta('passkeyFailed'))
      }

      const { options, sessionId }: { options: PublicKeyCredentialRequestOptionsJSON; sessionId?: string } = await optionsRes.json()

      const assertion = await startAuthentication({ optionsJSON: options })

      const verifyRes = await fetch('/api/auth/passkey/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion, sessionId }),
      })

      const data = await verifyRes.json()

      if (!verifyRes.ok) {
        throw new Error(data.error || ta('passkeyFailed'))
      }

      if (data?.tokens?.accessToken && data?.tokens?.refreshToken) {
        setTokens({
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
        })
      }

      setStep('authorize')
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError(ta('passkeyCancelled'))
      } else {
        setError(err.message || ta('passkeyFailed'))
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
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
        if (response.status === 403 && data.passkeyRequired) {
          setLoading(false)
          handlePasskeyLogin()
          return
        }
        throw new Error(data.error || ta('loginFailed'))
      }

      if (data?.tokens?.accessToken && data?.tokens?.refreshToken) {
        setTokens({
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
        })
      }

      setStep('authorize')
    } catch (err: any) {
      setError(err.message || tc('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleAuthorize() {
    setError('')
    setAuthorizeLoading(true)

    const code = userCode.toUpperCase().trim()
    if (!code || !/^[A-Z]{4}-[0-9]{4}$/.test(code)) {
      setError(t('invalidCodeFormat'))
      setAuthorizeLoading(false)
      return
    }

    try {
      const accessToken = getAccessToken()
      if (!accessToken) {
        setStep('authenticate')
        setError(t('sessionExpired'))
        return
      }

      const response = await fetch('/api/auth/device/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userCode: code }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 401) {
          setStep('authenticate')
          setError(t('sessionExpired'))
          return
        }
        throw new Error(data.error || t('authFailed'))
      }

      setStep('success')
    } catch (err: any) {
      setError(err.message || t('failedToAuthorize'))
    } finally {
      setAuthorizeLoading(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <BrandLogo height={64} className="mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-foreground">
              {t('authorizeTitle')}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {t('authorizeDescription')}
            </p>
          </div>

          {/* Step 1: Authenticate */}
          {step === 'authenticate' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogIn className="w-5 h-5" />
                  {t('signInTitle')}
                </CardTitle>
                <CardDescription>
                  {t('signInDescription')}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  {error && (
                    <div className="p-3 bg-destructive-visible border-2 border-destructive-visible rounded-lg">
                      <p className="text-sm text-destructive font-medium">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handlePasswordLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{ta('usernameOrEmail')}</Label>
                      <Input
                        id="email"
                        type="text"
                        placeholder={ta('usernameOrEmailPlaceholder')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="username"
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">{ta('password')}</Label>
                      <PasswordInput
                        id="password"
                        placeholder={ta('passwordPlaceholder')}
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
                      {loading ? ta('signingIn') : ta('signIn')}
                    </Button>
                  </form>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">{tc('or')}</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    className="w-full"
                    disabled={passkeyLoading}
                    onClick={handlePasskeyLogin}
                  >
                    <Fingerprint className="w-4 h-4 mr-2" />
                    {passkeyLoading ? ta('authenticating') : ta('usePassKey')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Authorize */}
          {step === 'authorize' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Monitor className="w-5 h-5" />
                  {t('authorizeDevice')}
                </CardTitle>
                <CardDescription>
                  {t('confirmCode')}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  {error && (
                    <div className="p-3 bg-destructive-visible border-2 border-destructive-visible rounded-lg">
                      <p className="text-sm text-destructive font-medium">{error}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="userCode">{t('deviceCode')}</Label>
                    <Input
                      id="userCode"
                      type="text"
                      placeholder={t('deviceCodePlaceholder')}
                      value={userCode}
                      onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                      className="text-center text-2xl font-mono tracking-widest"
                      maxLength={9}
                      required
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {t('deviceCodeHint')}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="default"
                    size="default"
                    className="w-full"
                    disabled={authorizeLoading || !userCode}
                    onClick={handleAuthorize}
                  >
                    {authorizeLoading ? t('authorizing') : t('authorizeButton')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/10 rounded-full">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">{t('authComplete')}</h2>
                    <p className="text-sm text-muted-foreground mt-2">
                      {t('authCompleteDescription')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {step === 'error' && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-destructive/10 rounded-full">
                    <XCircle className="w-8 h-8 text-destructive" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">{t('authFailed')}</h2>
                    <p className="text-sm text-muted-foreground mt-2">
                      {error || t('authFailedDescription')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => { setStep('authenticate'); setError(''); }}
                  >
                    {t('tryAgain')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DevicePage() {
  return (
    <Suspense fallback={
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <div className="text-center">
          <BrandLogo height={64} className="mx-auto mb-4 animate-pulse" ariaHidden />
        </div>
      </div>
    }>
      <DeviceAuthForm />
    </Suspense>
  )
}
