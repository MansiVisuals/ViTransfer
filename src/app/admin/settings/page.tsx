'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Settings as SettingsIcon, Save } from 'lucide-react'
import { CompanyBrandingSection } from '@/components/settings/CompanyBrandingSection'
import { DomainConfigurationSection } from '@/components/settings/DomainConfigurationSection'
import { EmailSettingsSection } from '@/components/settings/EmailSettingsSection'
import { VideoProcessingSettingsSection } from '@/components/settings/VideoProcessingSettingsSection'
import { ProjectBehaviorSection } from '@/components/settings/ProjectBehaviorSection'
import { SecuritySettingsSection } from '@/components/settings/SecuritySettingsSection'
import { apiPatch, apiPost, apiFetch } from '@/lib/api-client'

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
  defaultWatermarkEnabled: boolean | null
  defaultWatermarkText: string | null
  autoApproveProject: boolean | null
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
  const [defaultWatermarkEnabled, setDefaultWatermarkEnabled] = useState(true)
  const [defaultWatermarkText, setDefaultWatermarkText] = useState('')
  const [autoApproveProject, setAutoApproveProject] = useState(true)

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
  const [trackAnalytics, setTrackAnalytics] = useState(true)
  const [trackSecurityLogs, setTrackSecurityLogs] = useState(true)
  const [viewSecurityEvents, setViewSecurityEvents] = useState(false)

  // Collapsible section state (all collapsed by default)
  const [showCompanyBranding, setShowCompanyBranding] = useState(false)
  const [showDomainConfiguration, setShowDomainConfiguration] = useState(false)
  const [showEmailSettings, setShowEmailSettings] = useState(false)
  const [showVideoProcessing, setShowVideoProcessing] = useState(false)
  const [showProjectBehavior, setShowProjectBehavior] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await apiFetch('/api/settings')
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
        setDefaultWatermarkEnabled(data.defaultWatermarkEnabled ?? true)
        setDefaultWatermarkText(data.defaultWatermarkText || '')
        setAutoApproveProject(data.autoApproveProject ?? true)
        setTestEmailAddress(data.smtpFromAddress || '')

        // Set notification settings
        setAdminNotificationSchedule(data.adminNotificationSchedule || 'HOURLY')
        setAdminNotificationTime(data.adminNotificationTime || '09:00')
        setAdminNotificationDay(data.adminNotificationDay ?? 1)

        // Load security settings
        const securityResponse = await apiFetch('/api/settings/security')
        if (securityResponse.ok) {
          const securityData = await securityResponse.json()
          setSecuritySettings(securityData)

          // Set security form values
          setHttpsEnabled(securityData.httpsEnabled ?? false)
          setHotlinkProtection(securityData.hotlinkProtection || 'LOG_ONLY')
          setIpRateLimit(securityData.ipRateLimit?.toString() || '1000')
          setSessionRateLimit(securityData.sessionRateLimit?.toString() || '600')
          setShareSessionRateLimit(securityData.shareSessionRateLimit?.toString() || '300')
          setShareTokenTtlSeconds(securityData.shareTokenTtlSeconds ? securityData.shareTokenTtlSeconds.toString() : '')
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
        smtpPort: smtpPort ? parseInt(smtpPort, 10) : 587,
        smtpUsername: smtpUsername || null,
        smtpPassword: smtpPassword || null,
        smtpFromAddress: smtpFromAddress || null,
        smtpSecure: smtpSecure || 'STARTTLS',
        appDomain: appDomain || null,
        defaultPreviewResolution: defaultPreviewResolution || '720p',
        defaultWatermarkEnabled: defaultWatermarkEnabled,
        defaultWatermarkText: defaultWatermarkText || null,
        autoApproveProject: autoApproveProject,
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
        // Update form state with refreshed data
        setCompanyName(refreshedData.companyName || '')
        setSmtpServer(refreshedData.smtpServer || '')
        setSmtpPort(refreshedData.smtpPort?.toString() || '587')
        setSmtpUsername(refreshedData.smtpUsername || '')
        setSmtpPassword(refreshedData.smtpPassword || '')
        setSmtpFromAddress(refreshedData.smtpFromAddress || '')
        setSmtpSecure(refreshedData.smtpSecure || 'STARTTLS')
        setAppDomain(refreshedData.appDomain || '')
        setDefaultPreviewResolution(refreshedData.defaultPreviewResolution || '720p')
        setDefaultWatermarkText(refreshedData.defaultWatermarkText || '')
        setAutoApproveProject(refreshedData.autoApproveProject ?? true)
        setAdminNotificationSchedule(refreshedData.adminNotificationSchedule || 'HOURLY')
        setAdminNotificationTime(refreshedData.adminNotificationTime || '09:00')
        setAdminNotificationDay(refreshedData.adminNotificationDay ?? 1)
      }

      // Reload security settings data
      const securityRefreshResponse = await apiFetch('/api/settings/security')
      if (securityRefreshResponse.ok) {
        const refreshedSecurityData = await securityRefreshResponse.json()
        setSecuritySettings(refreshedSecurityData)
        // Update form state with refreshed data
        setHttpsEnabled(refreshedSecurityData.httpsEnabled)
        setHotlinkProtection(refreshedSecurityData.hotlinkProtection)
        setIpRateLimit(refreshedSecurityData.ipRateLimit?.toString() || '1000')
        setSessionRateLimit(refreshedSecurityData.sessionRateLimit?.toString() || '600')
        setPasswordAttempts(refreshedSecurityData.passwordAttempts?.toString() || '5')
        setSessionTimeoutValue(refreshedSecurityData.sessionTimeoutValue?.toString() || '15')
        setSessionTimeoutUnit(refreshedSecurityData.sessionTimeoutUnit || 'MINUTES')
        setTrackAnalytics(refreshedSecurityData.trackAnalytics)
        setTrackSecurityLogs(refreshedSecurityData.trackSecurityLogs)
        setViewSecurityEvents(refreshedSecurityData.viewSecurityEvents)
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
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                <SettingsIcon className="w-7 h-7 sm:w-8 sm:h-8" />
                Global Settings
              </h1>
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
          <CompanyBrandingSection
            companyName={companyName}
            setCompanyName={setCompanyName}
            show={showCompanyBranding}
            setShow={setShowCompanyBranding}
          />

          <DomainConfigurationSection
            appDomain={appDomain}
            setAppDomain={setAppDomain}
            show={showDomainConfiguration}
            setShow={setShowDomainConfiguration}
          />

          <EmailSettingsSection
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
            show={showEmailSettings}
            setShow={setShowEmailSettings}
          />

          <VideoProcessingSettingsSection
            defaultPreviewResolution={defaultPreviewResolution}
            setDefaultPreviewResolution={setDefaultPreviewResolution}
            defaultWatermarkEnabled={defaultWatermarkEnabled}
            setDefaultWatermarkEnabled={setDefaultWatermarkEnabled}
            defaultWatermarkText={defaultWatermarkText}
            setDefaultWatermarkText={setDefaultWatermarkText}
            show={showVideoProcessing}
            setShow={setShowVideoProcessing}
          />

          <ProjectBehaviorSection
            autoApproveProject={autoApproveProject}
            setAutoApproveProject={setAutoApproveProject}
            show={showProjectBehavior}
            setShow={setShowProjectBehavior}
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
            sessionTimeoutValue={sessionTimeoutValue}
            setSessionTimeoutValue={setSessionTimeoutValue}
            sessionTimeoutUnit={sessionTimeoutUnit}
            setSessionTimeoutUnit={setSessionTimeoutUnit}
            trackAnalytics={trackAnalytics}
            setTrackAnalytics={setTrackAnalytics}
            trackSecurityLogs={trackSecurityLogs}
            setTrackSecurityLogs={setTrackSecurityLogs}
            viewSecurityEvents={viewSecurityEvents}
            setViewSecurityEvents={setViewSecurityEvents}
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
          <Button onClick={handleSave} variant="default" disabled={saving} size="lg" className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save All Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
