'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Settings as SettingsIcon, Save } from 'lucide-react'
import { AppearanceSection } from '@/components/settings/AppearanceSection'
import { NotificationsSection } from '@/components/settings/NotificationsSection'
import { VideoProcessingSettingsSection } from '@/components/settings/VideoProcessingSettingsSection'
import { SecuritySettingsSection } from '@/components/settings/SecuritySettingsSection'
import { apiPatch, apiPost, apiFetch } from '@/lib/api-client'

interface Settings {
  id: string
  defaultTheme: string | null
  accentColor: string | null
  companyName: string | null
  brandingLogoPath: string | null
  emailHeaderStyle: string | null
  smtpServer: string | null
  smtpPort: number | null
  smtpUsername: string | null
  smtpPassword: string | null
  smtpFromAddress: string | null
  smtpSecure: string | null
  appDomain: string | null
  defaultPreviewResolution: string | null
  defaultWatermarkEnabled: boolean | null
  defaultWatermarkText: string | null
  maxUploadSizeGB: number | null
  defaultTimestampDisplay: string | null
  autoApproveProject: boolean | null
  defaultUsePreviewForApprovedPlayback: boolean | null
  adminNotificationSchedule: string | null
  adminNotificationTime: string | null
  adminNotificationDay: number | null
}

interface SecuritySettings {
  id: string
  httpsEnabled: boolean
  hotlinkProtection: string
  ipRateLimit: number
  sessionRateLimit: number
  shareSessionRateLimit?: number
  shareTokenTtlSeconds?: number | null
  passwordAttempts: number
  sessionTimeoutValue: number
  sessionTimeoutUnit: string
  adminSessionTimeoutValue: number
  adminSessionTimeoutUnit: string
  trackAnalytics: boolean
  trackSecurityLogs: boolean
  viewSecurityEvents: boolean
}

interface BlockedIP {
  id: string
  ipAddress: string
  reason: string | null
  createdAt: string
}

interface BlockedDomain {
  id: string
  domain: string
  reason: string | null
  createdAt: string
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

  // Form state for appearance
  const [defaultTheme, setDefaultTheme] = useState('auto')
  const [accentColor, setAccentColor] = useState('blue')
  const [brandingLogoPath, setBrandingLogoPath] = useState<string | null>(null)
  const [brandingLogoPreview, setBrandingLogoPreview] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [emailHeaderStyle, setEmailHeaderStyle] = useState('LOGO_AND_NAME')
  // Pending logo changes (staged until save)
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null)
  const [pendingLogoRemoval, setPendingLogoRemoval] = useState(false)

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
  const [defaultWatermarkEnabled, setDefaultWatermarkEnabled] = useState(true)
  const [defaultWatermarkText, setDefaultWatermarkText] = useState('')
  const [maxUploadSizeGB, setMaxUploadSizeGB] = useState('1')
  const [defaultTimestampDisplay, setDefaultTimestampDisplay] = useState('TIMECODE')
  const [autoApproveProject, setAutoApproveProject] = useState(true)
  const [defaultUsePreviewForApprovedPlayback, setDefaultUsePreviewForApprovedPlayback] = useState(false)

  // Form state for admin notification settings
  const [adminNotificationSchedule, setAdminNotificationSchedule] = useState('HOURLY')
  const [adminNotificationTime, setAdminNotificationTime] = useState('09:00')
  const [adminNotificationDay, setAdminNotificationDay] = useState(1)

  // Form state for security settings
  const [showSecuritySettings, setShowSecuritySettings] = useState(false)
  const [httpsEnabled, setHttpsEnabled] = useState(false)
  const [hotlinkProtection, setHotlinkProtection] = useState('LOG_ONLY')
  const [ipRateLimit, setIpRateLimit] = useState('1000')
  const [sessionRateLimit, setSessionRateLimit] = useState('600')
  const [shareSessionRateLimit, setShareSessionRateLimit] = useState('300')
  const [shareTokenTtlSeconds, setShareTokenTtlSeconds] = useState('')
  const [passwordAttempts, setPasswordAttempts] = useState('5')
  const [sessionTimeoutValue, setSessionTimeoutValue] = useState('15')
  const [sessionTimeoutUnit, setSessionTimeoutUnit] = useState('MINUTES')
  const [adminSessionTimeoutValue, setAdminSessionTimeoutValue] = useState('15')
  const [adminSessionTimeoutUnit, setAdminSessionTimeoutUnit] = useState('MINUTES')
  const [trackAnalytics, setTrackAnalytics] = useState(true)
  const [trackSecurityLogs, setTrackSecurityLogs] = useState(true)
  const [viewSecurityEvents, setViewSecurityEvents] = useState(false)
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([])
  const [blockedDomains, setBlockedDomains] = useState<BlockedDomain[]>([])
  const [newIP, setNewIP] = useState('')
  const [newIPReason, setNewIPReason] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newDomainReason, setNewDomainReason] = useState('')
  const [blocklistsLoading, setBlocklistsLoading] = useState(false)

  // Collapsible section state (all collapsed by default)
  const [showBrandingAppearance, setShowBrandingAppearance] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showVideoProcessing, setShowVideoProcessing] = useState(false)

  const applySettingsToForm = useCallback((data: Settings) => {
    setDefaultTheme(data.defaultTheme || 'auto')
    setAccentColor(data.accentColor || 'blue')
    setCompanyName(data.companyName || '')
    setBrandingLogoPath(data.brandingLogoPath || null)
    setBrandingLogoPreview(data.brandingLogoPath ? `/api/branding/logo?ts=${Date.now()}` : null)
    setPendingLogoFile(null)
    setPendingLogoRemoval(false)
    setEmailHeaderStyle(data.emailHeaderStyle || 'LOGO_AND_NAME')
    setSmtpServer(data.smtpServer || '')
    setSmtpPort(data.smtpPort?.toString() || '587')
    setSmtpUsername(data.smtpUsername || '')
    setSmtpPassword(data.smtpPassword || '')
    setSmtpFromAddress(data.smtpFromAddress || '')
    setSmtpSecure(data.smtpSecure || 'STARTTLS')
    setAppDomain(data.appDomain || '')
    setDefaultPreviewResolution(data.defaultPreviewResolution || '720p')
    setDefaultWatermarkEnabled(data.defaultWatermarkEnabled ?? true)
    setDefaultWatermarkText(data.defaultWatermarkText || '')
    setMaxUploadSizeGB(data.maxUploadSizeGB?.toString() || '1')
    setDefaultTimestampDisplay(data.defaultTimestampDisplay || 'TIMECODE')
    setAutoApproveProject(data.autoApproveProject ?? true)
    setDefaultUsePreviewForApprovedPlayback(data.defaultUsePreviewForApprovedPlayback ?? false)
    setTestEmailAddress(data.smtpFromAddress || '')
    setAdminNotificationSchedule(data.adminNotificationSchedule || 'HOURLY')
    setAdminNotificationTime(data.adminNotificationTime || '09:00')
    setAdminNotificationDay(data.adminNotificationDay ?? 1)
  }, [])

  const applySecuritySettingsToForm = useCallback((data: SecuritySettings) => {
    setHttpsEnabled(data.httpsEnabled ?? false)
    setHotlinkProtection(data.hotlinkProtection || 'LOG_ONLY')
    setIpRateLimit(data.ipRateLimit?.toString() || '1000')
    setSessionRateLimit(data.sessionRateLimit?.toString() || '600')
    setShareSessionRateLimit(data.shareSessionRateLimit?.toString() || '300')
    setShareTokenTtlSeconds(data.shareTokenTtlSeconds ? data.shareTokenTtlSeconds.toString() : '')
    setPasswordAttempts(data.passwordAttempts?.toString() || '5')
    setSessionTimeoutValue(data.sessionTimeoutValue?.toString() || '15')
    setSessionTimeoutUnit(data.sessionTimeoutUnit || 'MINUTES')
    setAdminSessionTimeoutValue(data.adminSessionTimeoutValue?.toString() || '15')
    setAdminSessionTimeoutUnit(data.adminSessionTimeoutUnit || 'MINUTES')
    setTrackAnalytics(data.trackAnalytics ?? true)
    setTrackSecurityLogs(data.trackSecurityLogs ?? true)
    setViewSecurityEvents(data.viewSecurityEvents ?? false)
  }, [])

  // Validate and stage logo file for upload (mirrors server-side validation in /api/settings/logo)
  const handleLogoUpload = useCallback(async (file: File) => {
    setLogoError('')
    setLogoUploading(true)
    
    try {
      // File type validation
      if (!file || (!file.type.includes('svg') && !file.name.toLowerCase().endsWith('.svg'))) {
        setLogoError('Only SVG files are allowed')
        return
      }
      
      // Size validation (max 300KB)
      if (file.size > 300 * 1024) {
        setLogoError('SVG too large (max 300KB)')
        return
      }

      const text = await file.text()
      
      // Magic byte check: must start with <svg or <?xml
      const leading = text.trimStart().slice(0, 256).toLowerCase()
      if (!leading.startsWith('<svg') && !leading.startsWith('<?xml')) {
        setLogoError('Invalid SVG file')
        return
      }
      
      // Security validation (isSafeSvg)
      // Strip XML declaration if present before checking for <svg
      const stripped = text.trim().replace(/^<\?xml[^?]*\?>\s*/i, '')
      if (!/^<svg[\s>]/i.test(stripped)) {
        setLogoError('Invalid or unsafe SVG content')
        return
      }
      if (/<script[\s>]/i.test(text)) {
        setLogoError('Invalid or unsafe SVG content')
        return
      }
      if (/on[a-zA-Z]+\s*=/.test(text)) {
        setLogoError('Invalid or unsafe SVG content')
        return
      }
      if (/javascript:/i.test(text)) {
        setLogoError('Invalid or unsafe SVG content')
        return
      }

      // Stage file for upload on save
      setPendingLogoFile(file)
      setPendingLogoRemoval(false)
      setBrandingLogoPreview(URL.createObjectURL(file))
    } catch {
      setLogoError('Invalid SVG file')
    } finally {
      setLogoUploading(false)
    }
  }, [])

  // Stage logo removal for save
  const handleLogoRemove = useCallback(async () => {
    setLogoError('')
    setPendingLogoFile(null)
    setPendingLogoRemoval(true)
    setBrandingLogoPreview(null)
  }, [])

  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await apiFetch('/api/settings')
        if (!response.ok) {
          throw new Error('Failed to load settings')
        }
        const data = await response.json()
        setSettings(data)

        applySettingsToForm(data)

        // Load security settings
        const securityResponse = await apiFetch('/api/settings/security')
        if (securityResponse.ok) {
          const securityData = await securityResponse.json()
          setSecuritySettings(securityData)
          applySecuritySettingsToForm(securityData)
        }
      } catch (err) {
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [applySecuritySettingsToForm, applySettingsToForm])

  const loadBlocklists = async () => {
    setBlocklistsLoading(true)
    try {
      const [ipsResponse, domainsResponse] = await Promise.all([
        apiFetch('/api/security/blocklist/ips'),
        apiFetch('/api/security/blocklist/domains')
      ])

      if (ipsResponse.ok) {
        const ipsData = await ipsResponse.json()
        setBlockedIPs(ipsData.blockedIPs || [])
      }

      if (domainsResponse.ok) {
        const domainsData = await domainsResponse.json()
        setBlockedDomains(domainsData.blockedDomains || [])
      }
    } catch (err) {
      // keep prior state on failure
    } finally {
      setBlocklistsLoading(false)
    }
  }

  useEffect(() => {
    if (showSecuritySettings) {
      loadBlocklists()
    }
  }, [showSecuritySettings])

  const handleAddIP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIP.trim()) return

    try {
      const response = await apiFetch('/api/security/blocklist/ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipAddress: newIP.trim(), reason: newIPReason.trim() || null })
      })

      if (!response.ok) {
        const error = await response.json()
        setError(error.error || 'Failed to block IP')
        return
      }

      setNewIP('')
      setNewIPReason('')
      loadBlocklists()
    } catch {
      setError('Failed to block IP address')
    }
  }

  const handleRemoveIP = async (id: string) => {
    if (!confirm('Remove this IP from blocklist?')) return

    try {
      await apiFetch('/api/security/blocklist/ips', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })

      loadBlocklists()
    } catch {
      setError('Failed to remove IP from blocklist')
    }
  }

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDomain.trim()) return

    try {
      const response = await apiFetch('/api/security/blocklist/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain.trim(), reason: newDomainReason.trim() || null })
      })

      if (!response.ok) {
        const error = await response.json()
        setError(error.error || 'Failed to block domain')
        return
      }

      setNewDomain('')
      setNewDomainReason('')
      loadBlocklists()
    } catch {
      setError('Failed to block domain')
    }
  }

  const handleRemoveDomain = async (id: string) => {
    if (!confirm('Remove this domain from blocklist?')) return

    try {
      await apiFetch('/api/security/blocklist/domains', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })

      loadBlocklists()
    } catch {
      setError('Failed to remove domain from blocklist')
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess(false)
    setLogoError('')

    try {
      // Handle pending logo upload
      let newLogoPath = brandingLogoPath
      if (pendingLogoFile) {
        setLogoUploading(true)
        try {
          const buffer = await pendingLogoFile.arrayBuffer()
          const res = await apiFetch('/api/settings/logo', {
            method: 'POST',
            headers: { 'Content-Type': pendingLogoFile.type || 'image/svg+xml' },
            body: buffer,
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(data?.error || 'Failed to upload logo')
          }
          newLogoPath = data.path || '/uploads/branding/logo.svg'
          setPendingLogoFile(null)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to upload logo'
          setLogoError(message)
          throw err
        } finally {
          setLogoUploading(false)
        }
      } else if (pendingLogoRemoval && brandingLogoPath) {
        // Handle pending logo removal
        setLogoUploading(true)
        try {
          const res = await apiFetch('/api/settings/logo', { method: 'DELETE' })
          if (!res.ok && res.status !== 404) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data?.error || 'Failed to remove logo')
          }
          newLogoPath = null
          setPendingLogoRemoval(false)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to remove logo'
          setLogoError(message)
          throw err
        } finally {
          setLogoUploading(false)
        }
      }

      const updates = {
        defaultTheme: defaultTheme || 'auto',
        accentColor: accentColor || 'blue',
        companyName: companyName || null,
        brandingLogoPath: newLogoPath || null,
        emailHeaderStyle: emailHeaderStyle || 'LOGO_AND_NAME',
        smtpServer: smtpServer || null,
        smtpPort: smtpPort ? parseInt(smtpPort, 10) : 587,
        smtpUsername: smtpUsername || null,
        smtpPassword: smtpPassword || null,
        smtpFromAddress: smtpFromAddress || null,
        smtpSecure: smtpSecure || 'STARTTLS',
        appDomain: appDomain || null,
        defaultPreviewResolution: defaultPreviewResolution || '720p',
        defaultWatermarkEnabled: defaultWatermarkEnabled,
        defaultWatermarkText: defaultWatermarkText || null,
        maxUploadSizeGB: parseInt(maxUploadSizeGB, 10) || 1,
        defaultTimestampDisplay: defaultTimestampDisplay || 'TIMECODE',
        autoApproveProject: autoApproveProject,
        defaultUsePreviewForApprovedPlayback: defaultUsePreviewForApprovedPlayback,
        adminNotificationSchedule: adminNotificationSchedule,
        adminNotificationTime: (adminNotificationSchedule === 'DAILY' || adminNotificationSchedule === 'WEEKLY') ? adminNotificationTime : null,
        adminNotificationDay: adminNotificationSchedule === 'WEEKLY' ? adminNotificationDay : null,
      }

      // Save global settings
      await apiPatch('/api/settings', updates)

      // Save security settings
      const securityUpdates = {
        httpsEnabled,
        hotlinkProtection,
        ipRateLimit: parseInt(ipRateLimit, 10) || 1000,
        sessionRateLimit: parseInt(sessionRateLimit, 10) || 600,
        shareSessionRateLimit: parseInt(shareSessionRateLimit, 10) || 300,
        shareTokenTtlSeconds: shareTokenTtlSeconds ? parseInt(shareTokenTtlSeconds, 10) : null,
        passwordAttempts: parseInt(passwordAttempts, 10) || 5,
        sessionTimeoutValue: parseInt(sessionTimeoutValue, 10) || 15,
        sessionTimeoutUnit: sessionTimeoutUnit || 'MINUTES',
        adminSessionTimeoutValue: parseInt(adminSessionTimeoutValue, 10) || 15,
        adminSessionTimeoutUnit: adminSessionTimeoutUnit || 'MINUTES',
        trackAnalytics,
        trackSecurityLogs,
        viewSecurityEvents,
      }

      await apiPatch('/api/settings/security', securityUpdates)

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)

      // Reload settings data to reflect changes
      const refreshResponse = await apiFetch('/api/settings')
      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json()
        setSettings(refreshedData)
        applySettingsToForm(refreshedData)
      }

      // Reload security settings data
      const securityRefreshResponse = await apiFetch('/api/settings/security')
      if (securityRefreshResponse.ok) {
        const refreshedSecurityData = await securityRefreshResponse.json()
        setSecuritySettings(refreshedSecurityData)
        applySecuritySettingsToForm(refreshedSecurityData)
      }

      // Refresh the page to update server components (like AdminHeader menu)
      router.refresh()
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
        smtpPort: smtpPort ? parseInt(smtpPort, 10) : null,
        smtpUsername: smtpUsername || null,
        smtpPassword: smtpPassword || null,
        smtpFromAddress: smtpFromAddress || null,
        smtpSecure: smtpSecure || 'STARTTLS',
        companyName: companyName || 'ViTransfer',
        accentColor: accentColor || 'blue',
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

      const data = await apiPost('/api/settings/test-email', {
        testEmail: testEmailAddress,
        smtpConfig: smtpConfig
      })

      setTestEmailResult({
        type: 'success',
        message: data.message || 'Test email sent successfully! Check your inbox.'
      })
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
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="max-w-4xl mx-auto">
        <div className="mb-4 sm:mb-6">
          <div className="flex justify-between items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                <SettingsIcon className="w-7 h-7 sm:w-8 sm:h-8" />
                Global Settings
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                Configure application-wide settings
              </p>
            </div>

            <Button onClick={handleSave} variant="default" disabled={saving} size="default">
              <Save className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Changes'}</span>
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
          <AppearanceSection
            defaultTheme={defaultTheme}
            setDefaultTheme={setDefaultTheme}
            accentColor={accentColor}
            setAccentColor={setAccentColor}
            companyName={companyName}
            setCompanyName={setCompanyName}
            appDomain={appDomain}
            setAppDomain={setAppDomain}
            brandingLogoUrl={brandingLogoPreview}
            onUploadLogo={handleLogoUpload}
            onRemoveLogo={handleLogoRemove}
            logoUploading={logoUploading}
            logoError={logoError}
            emailHeaderStyle={emailHeaderStyle}
            setEmailHeaderStyle={setEmailHeaderStyle}
            show={showBrandingAppearance}
            setShow={setShowBrandingAppearance}
          />

          <NotificationsSection
            smtpServer={smtpServer}
            setSmtpServer={setSmtpServer}
            smtpPort={smtpPort}
            setSmtpPort={setSmtpPort}
            smtpUsername={smtpUsername}
            setSmtpUsername={setSmtpUsername}
            smtpPassword={smtpPassword}
            setSmtpPassword={setSmtpPassword}
            smtpFromAddress={smtpFromAddress}
            setSmtpFromAddress={setSmtpFromAddress}
            smtpSecure={smtpSecure}
            setSmtpSecure={setSmtpSecure}
            testEmailAddress={testEmailAddress}
            setTestEmailAddress={setTestEmailAddress}
            testEmailSending={testEmailSending}
            testEmailResult={testEmailResult}
            handleTestEmail={handleTestEmail}
            adminNotificationSchedule={adminNotificationSchedule}
            setAdminNotificationSchedule={setAdminNotificationSchedule}
            adminNotificationTime={adminNotificationTime}
            setAdminNotificationTime={setAdminNotificationTime}
            adminNotificationDay={adminNotificationDay}
            setAdminNotificationDay={setAdminNotificationDay}
            show={showNotifications}
            setShow={setShowNotifications}
          />

          <VideoProcessingSettingsSection
            defaultPreviewResolution={defaultPreviewResolution}
            setDefaultPreviewResolution={setDefaultPreviewResolution}
            defaultWatermarkEnabled={defaultWatermarkEnabled}
            setDefaultWatermarkEnabled={setDefaultWatermarkEnabled}
            defaultWatermarkText={defaultWatermarkText}
            setDefaultWatermarkText={setDefaultWatermarkText}
            defaultTimestampDisplay={defaultTimestampDisplay}
            setDefaultTimestampDisplay={setDefaultTimestampDisplay}
            autoApproveProject={autoApproveProject}
            setAutoApproveProject={setAutoApproveProject}
            defaultUsePreviewForApprovedPlayback={defaultUsePreviewForApprovedPlayback}
            setDefaultUsePreviewForApprovedPlayback={setDefaultUsePreviewForApprovedPlayback}
            show={showVideoProcessing}
            setShow={setShowVideoProcessing}
          />

          <SecuritySettingsSection
            showSecuritySettings={showSecuritySettings}
            setShowSecuritySettings={setShowSecuritySettings}
            httpsEnabled={httpsEnabled}
            setHttpsEnabled={setHttpsEnabled}
            hotlinkProtection={hotlinkProtection}
            setHotlinkProtection={setHotlinkProtection}
            ipRateLimit={ipRateLimit}
            setIpRateLimit={setIpRateLimit}
            sessionRateLimit={sessionRateLimit}
            setSessionRateLimit={setSessionRateLimit}
            shareSessionRateLimit={shareSessionRateLimit}
            setShareSessionRateLimit={setShareSessionRateLimit}
            shareTokenTtlSeconds={shareTokenTtlSeconds}
            setShareTokenTtlSeconds={setShareTokenTtlSeconds}
            passwordAttempts={passwordAttempts}
            setPasswordAttempts={setPasswordAttempts}
            maxUploadSizeGB={maxUploadSizeGB}
            setMaxUploadSizeGB={setMaxUploadSizeGB}
            sessionTimeoutValue={sessionTimeoutValue}
            setSessionTimeoutValue={setSessionTimeoutValue}
            sessionTimeoutUnit={sessionTimeoutUnit}
            setSessionTimeoutUnit={setSessionTimeoutUnit}
            adminSessionTimeoutValue={adminSessionTimeoutValue}
            setAdminSessionTimeoutValue={setAdminSessionTimeoutValue}
            adminSessionTimeoutUnit={adminSessionTimeoutUnit}
            setAdminSessionTimeoutUnit={setAdminSessionTimeoutUnit}
            trackAnalytics={trackAnalytics}
            setTrackAnalytics={setTrackAnalytics}
            trackSecurityLogs={trackSecurityLogs}
            setTrackSecurityLogs={setTrackSecurityLogs}
            viewSecurityEvents={viewSecurityEvents}
            setViewSecurityEvents={setViewSecurityEvents}
            blockedIPs={blockedIPs}
            blockedDomains={blockedDomains}
            newIP={newIP}
            setNewIP={setNewIP}
            newIPReason={newIPReason}
            setNewIPReason={setNewIPReason}
            newDomain={newDomain}
            setNewDomain={setNewDomain}
            newDomainReason={newDomainReason}
            setNewDomainReason={setNewDomainReason}
            onAddIP={handleAddIP}
            onRemoveIP={handleRemoveIP}
            onAddDomain={handleAddDomain}
            onRemoveDomain={handleRemoveDomain}
            blocklistsLoading={blocklistsLoading}
          />
        </div>

        {/* Error notification at bottom */}
        {error && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-destructive-visible border-2 border-destructive-visible rounded-lg">
            <p className="text-xs sm:text-sm text-destructive font-medium">{error}</p>
          </div>
        )}

        {/* Success notification at bottom */}
        {success && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-success-visible border-2 border-success-visible rounded-lg">
            <p className="text-xs sm:text-sm text-success font-medium">Settings saved successfully!</p>
          </div>
        )}

        {/* Save button at bottom */}
        <div className="mt-6 sm:mt-8 pb-20 lg:pb-24 flex justify-end">
          <Button onClick={handleSave} variant="default" disabled={saving} size="default">
            <Save className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Changes'}</span>
          </Button>
        </div>
        </div>
      </div>
    </div>
  )
}
