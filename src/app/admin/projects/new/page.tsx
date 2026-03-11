'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Eye, EyeOff, RefreshCw, Copy, Check, Plus, X, Mail, AlertCircle, Calendar } from 'lucide-react'
import { apiPost, apiFetch } from '@/lib/api-client'
import { SharePasswordRequirements } from '@/components/SharePasswordRequirements'
import { ClientSelector } from '@/components/ClientSelector'
import { generateSecurePassword } from '@/lib/password-utils'

export default function NewProjectPage() {
  const router = useRouter()
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const [loading, setLoading] = useState(false)
  const [isShareOnly, setIsShareOnly] = useState(false)
  const [passwordProtected, setPasswordProtected] = useState(true)
  const [sharePassword, setSharePassword] = useState('')
  const [showPassword, setShowPassword] = useState(true)
  const [copied, setCopied] = useState(false)

  // Authentication mode
  const [authMode, setAuthMode] = useState<'PASSWORD' | 'OTP' | 'BOTH'>('PASSWORD')
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  
  // Due date
  const [dueDate, setDueDate] = useState('')
  const [dueReminder, setDueReminder] = useState<'NONE' | 'DAY_BEFORE' | 'WEEK_BEFORE'>('NONE')

  // Client info
  const [companyName, setCompanyName] = useState('')
  const [clientCompanyId, setClientCompanyId] = useState<string | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')

  // Generate password on mount
  useEffect(() => {
    setSharePassword(generateSecurePassword())
    checkSmtpConfiguration()
  }, [])

  // Check if SMTP is configured (reuse centralized logic from settings API)
  async function checkSmtpConfiguration() {
    try {
      const res = await apiFetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        // Settings API now includes smtpConfigured field using isSmtpConfigured() helper
        setSmtpConfigured(data.smtpConfigured !== false)
      }
    } catch (err) {
      console.error('Failed to check SMTP configuration:', err)
    }
  }

  // Smart recommendation: if email provided, recommend OTP
  useEffect(() => {
    if (recipientEmail && smtpConfigured && authMode === 'PASSWORD') {
      // Don't auto-switch, just show recommendation
    }
  }, [recipientEmail, smtpConfigured, authMode])

  function handleGeneratePassword() {
    setSharePassword(generateSecurePassword())
    setCopied(false)
  }

  function handleCopyPassword() {
    navigator.clipboard.writeText(sharePassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const isShareOnlyValue = formData.get('isShareOnly') === 'on'
    const data = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      companyName: companyName || null,
      clientCompanyId: clientCompanyId,
      recipientName: recipientName || null,
      recipientEmail: recipientEmail || null,
      sharePassword: (authMode === 'PASSWORD' || authMode === 'BOTH') && passwordProtected ? sharePassword : '',
      authMode: passwordProtected ? authMode : 'NONE',
      isShareOnly: isShareOnlyValue,
      dueDate: dueDate ? `${dueDate}T12:00:00.000Z` : null,
      dueReminder: dueDate ? dueReminder : null,
    }

    try {
      const project = await apiPost('/api/projects', data)
      router.push(`/admin/projects/${project.id}`)
    } catch (error) {
      alert(t('failedToCreateProject'))
    } finally {
      setLoading(false)
    }
  }

  const canUseOTP = smtpConfigured && recipientEmail
  const showOTPRecommendation = recipientEmail && smtpConfigured && authMode === 'PASSWORD'
  const needsPassword = authMode === 'PASSWORD' || authMode === 'BOTH'

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>{t('createNew')}</CardTitle>
            <CardDescription>{t('createDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">{t('titleLabel')}</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder={t('titlePlaceholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('descriptionOptional')}</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder={t('descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              {/* Client Selection with Directory Search */}
              <ClientSelector
                companyName={companyName}
                onCompanyChange={(name, id) => {
                  setCompanyName(name)
                  setClientCompanyId(id)
                }}
                recipientName={recipientName}
                onRecipientNameChange={setRecipientName}
                recipientEmail={recipientEmail}
                onRecipientEmailChange={setRecipientEmail}
                disabled={loading}
              />

              {/* Due Date */}
              <div className="space-y-3">
                <Label htmlFor="dueDate" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {t('dueDateOptional')}
                </Label>
                <div className="space-y-3">
                  <Input
                    id="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                  {dueDate && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <Label htmlFor="dueReminder">{t('reminder')}</Label>
                      <Select value={dueReminder} onValueChange={(v) => setDueReminder(v as 'NONE' | 'DAY_BEFORE' | 'WEEK_BEFORE')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">{t('noReminder')}</SelectItem>
                          <SelectItem value="DAY_BEFORE">{t('dayBefore')}</SelectItem>
                          <SelectItem value="WEEK_BEFORE">{t('weekBefore')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t('reminderHint')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Authentication Section */}
              <div className="space-y-4 border rounded-lg p-4 bg-primary-visible border-2 border-primary-visible">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="passwordProtected" className="text-base font-semibold">
                      {t('requireAuthRecommended')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('requireAuthDescriptionLong')}
                    </p>
                  </div>
                  <input
                    id="passwordProtected"
                    type="checkbox"
                    checked={passwordProtected}
                    onChange={(e) => setPasswordProtected(e.target.checked)}
                    className="h-5 w-5 rounded border-border text-primary focus:ring-primary mt-1"
                  />
                </div>

                {passwordProtected && (
                  <div className="space-y-4 pt-2 border-t">
                    {/* Authentication Method Selection */}
                    <div className="space-y-2">
                      <Label>{t('authMethod')}</Label>
                      <Select value={authMode} onValueChange={(v) => setAuthMode(v as 'PASSWORD' | 'OTP' | 'BOTH')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PASSWORD">{t('passwordOnly')}</SelectItem>
                          <SelectItem value="OTP" disabled={!canUseOTP}>
                            {t('otpOnly')} {!canUseOTP ? `(${t('requiresSMTPClient')})` : ''}
                          </SelectItem>
                          <SelectItem value="BOTH" disabled={!canUseOTP}>
                            {t('bothAuth')} {!canUseOTP ? `(${t('requiresSMTPClient')})` : ''}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {authMode === 'PASSWORD' && t('passwordDescriptionLong')}
                        {authMode === 'OTP' && t('otpDescriptionLong')}
                        {authMode === 'BOTH' && t('bothDescriptionLong')}
                      </p>

                      {/* Smart Recommendation */}
                      {showOTPRecommendation && (
                        <div className="flex items-start gap-2 p-3 bg-muted border border-border rounded-md">
                          <Mail className="w-4 h-4 text-primary mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{t('considerOtp')}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('considerOtpLong')}
                            </p>
                            <div className="flex gap-2 mt-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setAuthMode('OTP')}
                              >
                                {t('otpOnlyShort')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setAuthMode('BOTH')}
                              >
                                {t('bothPasswordOtp')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {!smtpConfigured && (
                        <div className="flex items-start gap-2 p-3 bg-warning-visible border border-warning-visible rounded-md">
                          <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
                          <p className="text-xs text-warning">
                            {t('configureSMTPLong')}
                          </p>
                        </div>
                      )}

                      {smtpConfigured && !recipientEmail && authMode !== 'PASSWORD' && (
                        <div className="flex items-start gap-2 p-3 bg-warning-visible border border-warning-visible rounded-md">
                          <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
                          <p className="text-xs text-warning">
                            {t('enterClientEmail')}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Password Field (conditional) */}
                    {needsPassword && (
                      <div className="space-y-3">
                        <Label htmlFor="sharePassword">{t('sharePassword')}</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="sharePassword"
                              value={sharePassword}
                              onChange={(e) => setSharePassword(e.target.value)}
                              type={showPassword ? 'text' : 'password'}
                              className="pr-10 font-mono"
                              required={needsPassword}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleGeneratePassword}
                            title={t('generatePassword')}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={handleCopyPassword}
                            title={t('copyPassword')}
                          >
                            {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                        {sharePassword && (
                          <SharePasswordRequirements password={sharePassword} />
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t('savePasswordWarningLong')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {!passwordProtected && (
                  <div className="flex items-start gap-2 p-3 bg-warning-visible border-2 border-warning-visible rounded-md">
                    <span className="text-warning text-sm font-bold">!</span>
                    <p className="text-sm text-warning font-medium">
                      {t('noAuthWarningLong')}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      id="isShareOnly"
                      name="isShareOnly"
                      type="checkbox"
                      checked={isShareOnly}
                      onChange={(e) => setIsShareOnly(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <Label htmlFor="isShareOnly" className="font-normal cursor-pointer">
                      {t('shareOnly')}
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    {t('shareOnlyLong')}
                  </p>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  {t('additionalOptionsLong')}
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="submit" variant="default" size="lg" disabled={loading}>
                  <Plus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{loading ? tc('creating') : t('createProject')}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => router.push('/admin/projects')}
                  disabled={loading}
                >
                  <X className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{tc('cancel')}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  )
}
