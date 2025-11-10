'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Save, Send, Loader2, Clock, AlertTriangle, CheckCircle } from 'lucide-react'

interface Settings {
  id: string
  companyName: string | null
  smtpServer: string | null
  smtpPort: number | null
  smtpUsername: string | null
  smtpPassword: string | null
  smtpFromAddress: string | null
  smtpSecure: string | null
  appDomain: string | null
  defaultPreviewResolution: string | null
  defaultWatermarkText: string | null
  autoApproveProject: boolean | null
}

interface SecuritySettings {
  id: string
  hotlinkProtection: string
  ipRateLimit: number
  sessionRateLimit: number
  passwordAttempts: number
  sessionTimeoutValue: number
  sessionTimeoutUnit: string
  trackAnalytics: boolean
  trackSecurityLogs: boolean
  viewSecurityEvents: boolean
}

export default function GlobalSettingsPage() {
  const router = useRouter()

  const [settings, setSettings] = useState<Settings | null>(null)
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [testEmailSending, setTestEmailSending] = useState(false)
  const [testEmailResult, setTestEmailResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testEmailAddress, setTestEmailAddress] = useState('')

  // Form state for global settings
  const [companyName, setCompanyName] = useState('')
  const [smtpServer, setSmtpServer] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUsername, setSmtpUsername] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpFromAddress, setSmtpFromAddress] = useState('')
  const [smtpSecure, setSmtpSecure] = useState('STARTTLS')
  const [appDomain, setAppDomain] = useState('')
  const [defaultPreviewResolution, setDefaultPreviewResolution] = useState('720p')
  const [defaultWatermarkText, setDefaultWatermarkText] = useState('')
  const [autoApproveProject, setAutoApproveProject] = useState(true)

  // Form state for security settings
  const [showSecuritySettings, setShowSecuritySettings] = useState(false)
  const [hotlinkProtection, setHotlinkProtection] = useState('LOG_ONLY')
  const [ipRateLimit, setIpRateLimit] = useState('1000')
  const [sessionRateLimit, setSessionRateLimit] = useState('600')
  const [passwordAttempts, setPasswordAttempts] = useState('5')
  const [sessionTimeoutValue, setSessionTimeoutValue] = useState('15')
  const [sessionTimeoutUnit, setSessionTimeoutUnit] = useState('MINUTES')
  const [trackAnalytics, setTrackAnalytics] = useState(true)
  const [trackSecurityLogs, setTrackSecurityLogs] = useState(true)
  const [viewSecurityEvents, setViewSecurityEvents] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch('/api/settings')
        if (!response.ok) {
          throw new Error('Failed to load settings')
        }
        const data = await response.json()
        setSettings(data)

        // Set form values
        setCompanyName(data.companyName || '')
        setSmtpServer(data.smtpServer || '')
        setSmtpPort(data.smtpPort?.toString() || '587')
        setSmtpUsername(data.smtpUsername || '')
        setSmtpPassword(data.smtpPassword || '')
        setSmtpFromAddress(data.smtpFromAddress || '')
        setSmtpSecure(data.smtpSecure || 'STARTTLS')
        setAppDomain(data.appDomain || '')
        setDefaultPreviewResolution(data.defaultPreviewResolution || '720p')
        setDefaultWatermarkText(data.defaultWatermarkText || '')
        setAutoApproveProject(data.autoApproveProject ?? true)
        setTestEmailAddress(data.smtpFromAddress || '')

        // Load security settings
        const securityResponse = await fetch('/api/settings/security')
        if (securityResponse.ok) {
          const securityData = await securityResponse.json()
          setSecuritySettings(securityData)

          // Set security form values
          setHotlinkProtection(securityData.hotlinkProtection || 'LOG_ONLY')
          setIpRateLimit(securityData.ipRateLimit?.toString() || '1000')
          setSessionRateLimit(securityData.sessionRateLimit?.toString() || '600')
          setPasswordAttempts(securityData.passwordAttempts?.toString() || '5')
          setSessionTimeoutValue(securityData.sessionTimeoutValue?.toString() || '15')
          setSessionTimeoutUnit(securityData.sessionTimeoutUnit || 'MINUTES')
          setTrackAnalytics(securityData.trackAnalytics ?? true)
          setTrackSecurityLogs(securityData.trackSecurityLogs ?? true)
          setViewSecurityEvents(securityData.viewSecurityEvents ?? false)
        }
      } catch (err) {
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess(false)

    try {
      const updates = {
        companyName: companyName || null,
        smtpServer: smtpServer || null,
        smtpPort: smtpPort ? parseInt(smtpPort) : 587,
        smtpUsername: smtpUsername || null,
        smtpPassword: smtpPassword || null,
        smtpFromAddress: smtpFromAddress || null,
        smtpSecure: smtpSecure || 'STARTTLS',
        appDomain: appDomain || null,
        defaultPreviewResolution: defaultPreviewResolution || '720p',
        defaultWatermarkText: defaultWatermarkText || null,
        autoApproveProject: autoApproveProject,
      }

      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save settings')
      }

      // Save security settings
      const securityUpdates = {
        hotlinkProtection,
        ipRateLimit: parseInt(ipRateLimit) || 1000,
        sessionRateLimit: parseInt(sessionRateLimit) || 600,
        passwordAttempts: parseInt(passwordAttempts) || 5,
        sessionTimeoutValue: parseInt(sessionTimeoutValue) || 15,
        sessionTimeoutUnit: sessionTimeoutUnit || 'MINUTES',
        trackAnalytics,
        trackSecurityLogs,
        viewSecurityEvents,
      }

      const securityResponse = await fetch('/api/settings/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(securityUpdates),
      })

      if (!securityResponse.ok) {
        const data = await securityResponse.json()
        throw new Error(data.error || 'Failed to save security settings')
      }

      setSuccess(true)

      // Force full page reload to update menu (if security dashboard toggle changed)
      // This ensures AdminHeader re-fetches settings and shows/hides Security menu
      setTimeout(() => {
        window.location.reload()
      }, 1000) // Give user 1 second to see success message
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestEmail() {
    setTestEmailSending(true)
    setTestEmailResult(null)

    try {
      // Prepare current form values as SMTP config
      const smtpConfig = {
        smtpServer: smtpServer || null,
        smtpPort: smtpPort ? parseInt(smtpPort) : null,
        smtpUsername: smtpUsername || null,
        smtpPassword: smtpPassword || null,
        smtpFromAddress: smtpFromAddress || null,
        smtpSecure: smtpSecure || 'STARTTLS',
        companyName: companyName || 'VidTransfer',
      }

      // Validate that all required fields are filled
      if (!smtpConfig.smtpServer || !smtpConfig.smtpPort || !smtpConfig.smtpUsername ||
          !smtpConfig.smtpPassword || !smtpConfig.smtpFromAddress) {
        setTestEmailResult({
          type: 'error',
          message: 'Please fill in all SMTP fields before testing'
        })
        setTestEmailSending(false)
        return
      }

      const response = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testEmail: testEmailAddress,
          smtpConfig: smtpConfig
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setTestEmailResult({
          type: 'success',
          message: data.message || 'Test email sent successfully! Check your inbox.'
        })
      } else {
        setTestEmailResult({
          type: 'error',
          message: data.error || 'Failed to send test email'
        })
      }
    } catch (error) {
      setTestEmailResult({
        type: 'error',
        message: 'Failed to send test email'
      })
    } finally {
      setTestEmailSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Global Settings</h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                Configure application-wide settings
              </p>
            </div>

            <Button onClick={handleSave} variant="default" disabled={saving} size="lg" className="w-full sm:w-auto">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-destructive-visible border-2 border-destructive-visible rounded-lg">
            <p className="text-xs sm:text-sm text-destructive font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-success-visible border-2 border-success-visible rounded-lg">
            <p className="text-xs sm:text-sm text-success font-medium">Settings saved successfully!</p>
          </div>
        )}

        <div className="space-y-4 sm:space-y-6">
          {/* Company Branding */}
          <Card>
            <CardHeader>
              <CardTitle>Company Branding</CardTitle>
              <CardDescription>
                Customize how your company appears in the application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Studio, Your Company Name"
                />
                <p className="text-xs text-muted-foreground">
                  This name will be displayed in feedback messages and comments instead of "Studio"
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Domain Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Domain Configuration</CardTitle>
              <CardDescription>
                Set your application domain for generating share links
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="appDomain">Application Domain</Label>
                <Input
                  id="appDomain"
                  type="text"
                  value={appDomain}
                  onChange={(e) => setAppDomain(e.target.value)}
                  placeholder="e.g., https://yourdomain.com"
                />
                <p className="text-xs text-muted-foreground">
                  Include protocol (https://) and no trailing slash. Used for generating share links.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Email Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Email / SMTP Configuration</CardTitle>
              <CardDescription>
                Configure SMTP settings for email notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpServer">SMTP Server</Label>
                  <Input
                    id="smtpServer"
                    type="text"
                    value={smtpServer}
                    onChange={(e) => setSmtpServer(e.target.value)}
                    placeholder="e.g., smtp.provider.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPort">Port</Label>
                  <Input
                    id="smtpPort"
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpFromAddress">From Email Address</Label>
                <Input
                  id="smtpFromAddress"
                  type="email"
                  value={smtpFromAddress}
                  onChange={(e) => setSmtpFromAddress(e.target.value)}
                  placeholder="e.g., email@yourdomain.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Security / Encryption</Label>
                <div className="space-y-3 p-4 bg-muted/50 rounded-md border border-border">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="smtpSecure"
                      value="STARTTLS"
                      checked={smtpSecure === 'STARTTLS'}
                      onChange={(e) => setSmtpSecure(e.target.value)}
                      className="mt-1 h-4 w-4 text-primary focus:ring-primary"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm group-hover:text-primary transition-colors">
                        STARTTLS (Recommended)
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Port 587 recommended. Most secure option for modern email providers.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="smtpSecure"
                      value="TLS"
                      checked={smtpSecure === 'TLS'}
                      onChange={(e) => setSmtpSecure(e.target.value)}
                      className="mt-1 h-4 w-4 text-primary focus:ring-primary"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm group-hover:text-primary transition-colors">
                        TLS/SSL
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Port 465 recommended. Legacy secure connection method.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="smtpSecure"
                      value="NONE"
                      checked={smtpSecure === 'NONE'}
                      onChange={(e) => setSmtpSecure(e.target.value)}
                      className="mt-1 h-4 w-4 text-primary focus:ring-primary"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm group-hover:text-primary transition-colors">
                        None
                      </div>
                      <div className="text-xs text-destructive mt-1">
                        Port 25 or custom. Not recommended - credentials sent unencrypted.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpUsername">SMTP Username</Label>
                <Input
                  id="smtpUsername"
                  type="text"
                  value={smtpUsername}
                  onChange={(e) => setSmtpUsername(e.target.value)}
                  placeholder="SMTP username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smtpPassword">SMTP Password</Label>
                <PasswordInput
                  id="smtpPassword"
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  placeholder="SMTP password or app password"
                />
                <p className="text-xs text-muted-foreground">
                  For iCloud or Gmail, use an App Specific Password. For other providers, use your SMTP password.
                </p>
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium mb-2">Test Email Configuration</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Test your email configuration with the current form values before saving. This helps ensure your settings are correct.
                </p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="testEmailAddress">Test Email Address</Label>
                    <Input
                      id="testEmailAddress"
                      type="email"
                      value={testEmailAddress}
                      onChange={(e) => setTestEmailAddress(e.target.value)}
                      placeholder="Enter email to receive test"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestEmail}
                    disabled={testEmailSending || !testEmailAddress}
                    className="w-full"
                    size="default"
                  >
                    {testEmailSending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending Test Email...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Test Email
                      </>
                    )}
                  </Button>

                  {testEmailResult && (
                    <div className={`p-3 rounded-lg text-xs sm:text-sm font-medium ${
                      testEmailResult.type === 'success'
                        ? 'bg-success-visible text-success border-2 border-success-visible'
                        : 'bg-destructive-visible text-destructive border-2 border-destructive-visible'
                    }`}>
                      {testEmailResult.message}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Video Processing Defaults */}
          <Card>
            <CardHeader>
              <CardTitle>Default Video Processing Settings</CardTitle>
              <CardDescription>
                Set default settings for new projects
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resolution">Default Preview Resolution</Label>
                <select
                  id="resolution"
                  value={defaultPreviewResolution}
                  onChange={(e) => setDefaultPreviewResolution(e.target.value)}
                  className="w-full px-3 py-2 text-sm sm:text-base bg-background text-foreground border border-border rounded-md"
                >
                  <option value="720p">720p (1280x720 or 720x1280 for vertical)</option>
                  <option value="1080p">1080p (1920x1080 or 1080x1920 for vertical)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  New projects will use this resolution by default. Can be overridden per project.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="watermark">Default Watermark Text</Label>
                <Input
                  id="watermark"
                  value={defaultWatermarkText}
                  onChange={(e) => setDefaultWatermarkText(e.target.value)}
                  placeholder="e.g., PREVIEW, CONFIDENTIAL"
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use project-specific format. New projects will use this as default.
                  <br />
                  <span className="text-warning">Only letters, numbers, spaces, and these characters: - _ . ( )</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Project Behavior Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Project Behavior</CardTitle>
              <CardDescription>
                Configure how projects behave when videos are approved
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="autoApproveProject" className="flex items-center gap-2 cursor-pointer">
                  <input
                    id="autoApproveProject"
                    type="checkbox"
                    checked={autoApproveProject}
                    onChange={(e) => setAutoApproveProject(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Auto-approve project when all videos are approved
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, the project will automatically be marked as APPROVED when all unique videos have at least one approved version.
                  <br />
                  <span className="text-warning">Disable this if you upload videos one-by-one and don&apos;t want the project to auto-approve until you&apos;re ready.</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Security Settings */}
          <Card className="border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Advanced Security Settings</CardTitle>
                  <CardDescription>
                    Configure advanced security options
                  </CardDescription>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSecuritySettings}
                    onChange={(e) => setShowSecuritySettings(e.target.checked)}
                    className="w-5 h-5"
                  />
                  <span className="text-sm font-medium">Advanced Security Settings</span>
                </label>
              </div>
            </CardHeader>

            {showSecuritySettings && (
              <CardContent className="space-y-4 border-t pt-4">
                <div className="p-3 bg-warning-visible border-2 border-warning-visible rounded-md">
                  <p className="text-sm font-semibold text-warning">
                    Warning: Advanced Configuration
                  </p>
                  <p className="text-xs text-warning font-medium mt-1">
                    These settings control critical security features including rate limiting, hotlink protection, and access controls. Modifying these values without proper understanding may impact system functionality and security. Only adjust if you are familiar with these security mechanisms.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hotlinkProtection">Hotlink Protection</Label>
                  <select
                    id="hotlinkProtection"
                    value={hotlinkProtection}
                    onChange={(e) => setHotlinkProtection(e.target.value)}
                    className="w-full px-3 py-2 text-sm sm:text-base bg-background text-foreground border border-border rounded-md"
                  >
                    <option value="DISABLED">Disabled - No hotlink protection</option>
                    <option value="LOG_ONLY">Log Only - Detect but allow</option>
                    <option value="BLOCK_STRICT">Block Strict - Block suspected hotlinks</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Controls how the system handles hotlinking attempts. LOG_ONLY is recommended for monitoring.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ipRateLimit">IP Rate Limit</Label>
                    <Input
                      id="ipRateLimit"
                      type="number"
                      value={ipRateLimit}
                      onChange={(e) => setIpRateLimit(e.target.value)}
                      placeholder="300"
                    />
                    <p className="text-xs text-muted-foreground">
                      Requests per minute per IP
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sessionRateLimit">Session Rate Limit</Label>
                    <Input
                      id="sessionRateLimit"
                      type="number"
                      value={sessionRateLimit}
                      onChange={(e) => setSessionRateLimit(e.target.value)}
                      placeholder="120"
                    />
                    <p className="text-xs text-muted-foreground">
                      Requests per minute per session
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="passwordAttempts">Password Attempts</Label>
                    <Input
                      id="passwordAttempts"
                      type="number"
                      value={passwordAttempts}
                      onChange={(e) => setPasswordAttempts(e.target.value)}
                      placeholder="5"
                    />
                    <p className="text-xs text-muted-foreground">
                      Attempts before lockout
                    </p>
                  </div>
                </div>

                {/* Client Session Timeout */}
                <div className="space-y-3 border-t pt-4">
                  <div>
                    <Label className="text-base flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Client Session Timeout
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure how long client share sessions stay active. Admin sessions always use 15 minutes with auto-refresh.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sessionTimeoutValue">Timeout Value</Label>
                      <Input
                        id="sessionTimeoutValue"
                        type="number"
                        min="1"
                        max="52"
                        value={sessionTimeoutValue}
                        onChange={(e) => setSessionTimeoutValue(e.target.value)}
                        placeholder="15"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sessionTimeoutUnit">Timeout Unit</Label>
                      <select
                        id="sessionTimeoutUnit"
                        value={sessionTimeoutUnit}
                        onChange={(e) => setSessionTimeoutUnit(e.target.value)}
                        className="w-full px-3 py-2 text-sm sm:text-base bg-background text-foreground border border-border rounded-md"
                      >
                        <option value="MINUTES">Minutes</option>
                        <option value="HOURS">Hours</option>
                        <option value="DAYS">Days</option>
                        <option value="WEEKS">Weeks</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm font-medium">
                      Current Setting: {sessionTimeoutValue} {sessionTimeoutUnit.toLowerCase()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-start gap-2">
                      {(() => {
                        const val = parseInt(sessionTimeoutValue) || 15
                        const unit = sessionTimeoutUnit
                        if (unit === 'MINUTES') {
                          if (val < 5) return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Very short - users may be logged out while actively viewing</>
                          if (val <= 30) return <><CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-success" /> Good for security - sessions expire quickly</>
                          return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> Longer timeout - convenient but less secure</>
                        }
                        if (unit === 'HOURS') {
                          if (val <= 2) return <><CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-success" /> Balanced - good for longer review sessions</>
                          if (val <= 8) return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> Long timeout - convenient for all-day access</>
                          return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Very long - consider security implications</>
                        }
                        if (unit === 'DAYS') {
                          return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Extended timeout - only use for trusted environments</>
                        }
                        if (unit === 'WEEKS') {
                          return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Maximum timeout - use with caution</>
                        }
                        return ''
                      })()}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="trackAnalytics" className="flex items-center gap-2 cursor-pointer">
                      <input
                        id="trackAnalytics"
                        type="checkbox"
                        checked={trackAnalytics}
                        onChange={(e) => setTrackAnalytics(e.target.checked)}
                        className="w-4 h-4"
                      />
                      Track Analytics
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Enable or disable analytics tracking for page visits and downloads
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="trackSecurityLogs" className="flex items-center gap-2 cursor-pointer">
                      <input
                        id="trackSecurityLogs"
                        type="checkbox"
                        checked={trackSecurityLogs}
                        onChange={(e) => setTrackSecurityLogs(e.target.checked)}
                        className="w-4 h-4"
                      />
                      Track Security Logs
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Enable or disable security event logging (hotlink attempts, rate limits, suspicious activity)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="viewSecurityEvents" className="flex items-center gap-2 cursor-pointer">
                      <input
                        id="viewSecurityEvents"
                        type="checkbox"
                        checked={viewSecurityEvents}
                        onChange={(e) => setViewSecurityEvents(e.target.checked)}
                        className="w-4 h-4"
                      />
                      Show Security Dashboard
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Enable access to /admin/security page to view security events and logs (only visible when enabled)
                    </p>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Save button at bottom */}
        <div className="mt-6 sm:mt-8 flex justify-end">
          <Button onClick={handleSave} variant="default" disabled={saving} size="lg" className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save All Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
