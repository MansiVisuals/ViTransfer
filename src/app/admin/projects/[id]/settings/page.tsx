'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PasswordInput } from '@/components/ui/password-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { ReprocessModal } from '@/components/ReprocessModal'
import { RecipientManager } from '@/components/RecipientManager'
import { ScheduleSelector } from '@/components/ScheduleSelector'
import { SharePasswordRequirements } from '@/components/SharePasswordRequirements'
import { CompanyNameInput } from '@/components/CompanyNameInput'
import { apiFetch } from '@/lib/api-client'
import { sanitizeSlug, generateRandomSlug, generateSecurePassword } from '@/lib/password-utils'
import { apiPatch, apiPost } from '@/lib/api-client'
import { logError } from '@/lib/logging'
import Link from 'next/link'
import { ArrowLeft, Save, RefreshCw, Copy, Check, Calendar } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Project {
  id: string
  title: string
  slug: string
  description: string | null
  companyName: string | null
  clientCompanyId: string | null
  enableRevisions: boolean
  maxRevisions: number
  restrictCommentsToLatestVersion: boolean
  hideFeedback: boolean
  timestampDisplay: string
  sharePassword: string | null
  sharePasswordDecrypted: string | null
  authMode: string
  guestMode: boolean
  guestLatestOnly: boolean
  previewResolution: string
  watermarkEnabled: boolean
  watermarkText: string | null
  watermarkPositions: string
  watermarkOpacity: number
  watermarkFontSize: string
  allowAssetDownload: boolean
  allowClientAssetUpload: boolean
  clientCanApprove: boolean
  usePreviewForApprovedPlayback: boolean
  showClientTutorial: boolean
  clientNotificationSchedule: string
  clientNotificationTime: string | null
  clientNotificationDay: number | null
  dueDate: string | null
  dueReminder: string | null
}

export default function ProjectSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const projectId = params?.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [copiedPassword, setCopiedPassword] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [clientCompanyId, setClientCompanyId] = useState<string | null>(null)
  const [enableRevisions, setEnableRevisions] = useState(false)
  const [maxRevisions, setMaxRevisions] = useState<number | ''>('')
  const [restrictCommentsToLatestVersion, setRestrictCommentsToLatestVersion] = useState(false)
  const [hideFeedback, setHideFeedback] = useState(false)
  const [timestampDisplay, setTimestampDisplay] = useState<'AUTO' | 'TIMECODE'>('TIMECODE')
  const [sharePassword, setSharePassword] = useState('')
  const [authMode, setAuthMode] = useState('PASSWORD')
  const [guestMode, setGuestMode] = useState(false)
  const [guestLatestOnly, setGuestLatestOnly] = useState(true)
  const [useCustomSlug, setUseCustomSlug] = useState(false) // Toggle for custom slug
  const [customSlugValue, setCustomSlugValue] = useState('') // Store custom slug value
  const [previewResolution, setPreviewResolution] = useState('720p')
  const [watermarkEnabled, setWatermarkEnabled] = useState(true)
  const [watermarkText, setWatermarkText] = useState('')
  const [useCustomWatermark, setUseCustomWatermark] = useState(false)
  const [watermarkPositions, setWatermarkPositions] = useState('center')
  const [watermarkOpacity, setWatermarkOpacity] = useState(30)
  const [watermarkFontSize, setWatermarkFontSize] = useState('medium')
  const [allowAssetDownload, setAllowAssetDownload] = useState(true)
  const [allowClientAssetUpload, setAllowClientAssetUpload] = useState(false)
  const [clientCanApprove, setClientCanApprove] = useState(true)
  const [usePreviewForApprovedPlayback, setUsePreviewForApprovedPlayback] = useState(false)
  const [showClientTutorial, setShowClientTutorial] = useState(true)

  // Notification settings state
  const [clientNotificationSchedule, setClientNotificationSchedule] = useState('HOURLY')
  const [clientNotificationTime, setClientNotificationTime] = useState('09:00')
  const [clientNotificationDay, setClientNotificationDay] = useState(1)

  // Due date state
  const [dueDate, setDueDate] = useState('')
  const [dueReminder, setDueReminder] = useState<'NONE' | 'DAY_BEFORE' | 'WEEK_BEFORE'>('NONE')

  // SMTP and recipients validation (for OTP)
  const [smtpConfigured, setSmtpConfigured] = useState(true)
  const [recipients, setRecipients] = useState<any[]>([])
  const hasRecipientWithEmail = recipients?.some((r: any) => r.email && r.email.trim() !== '') || false

  // Collapsible section state (all collapsed by default)
  const [showProjectDetails, setShowProjectDetails] = useState(false)
  const [showClientInfo, setShowClientInfo] = useState(false)
  const [showClientSharePage, setShowClientSharePage] = useState(false)
  const [showVideoProcessing, setShowVideoProcessing] = useState(false)
  const [showSecurity, setShowSecurity] = useState(false)

  // Track original processing settings for change detection
  const [originalSettings, setOriginalSettings] = useState({
    title: '',
    previewResolution: '720p',
    watermarkEnabled: true,
    watermarkText: null as string | null,
    watermarkPositions: 'center',
    watermarkOpacity: 30,
    watermarkFontSize: 'medium',
  })

  // Reprocessing state
  const [showReprocessModal, setShowReprocessModal] = useState(false)
  const [pendingUpdates, setPendingUpdates] = useState<any>(null)
  const [reprocessing, setReprocessing] = useState(false)

  // Auto-generate slug from title
  const autoGeneratedSlug = sanitizeSlug(title)

  // Use custom slug if enabled, otherwise use auto-generated
  const slug = useCustomSlug ? customSlugValue : autoGeneratedSlug

  // Sanitize slug for live preview
  const sanitizedSlug = sanitizeSlug(slug)

  const copyPassword = async () => {
    if (sharePassword) {
      await navigator.clipboard.writeText(sharePassword)
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
    }
  }

  useEffect(() => {
    async function loadProject() {
      try {
        const response = await apiFetch(`/api/projects/${projectId}`)
        if (!response.ok) {
          throw new Error(t('failedToLoad'))
        }
        const data = await response.json()
        setProject(data)

        // Set SMTP status and recipients
        setSmtpConfigured(data.smtpConfigured !== false)
        setRecipients(data.recipients || [])

        // Set form values
        setTitle(data.title)
        setDescription(data.description || '')
        setCompanyName(data.companyName || '')
        setClientCompanyId(data.clientCompanyId || null)
        setEnableRevisions(data.enableRevisions)
        setMaxRevisions(data.maxRevisions)
        setRestrictCommentsToLatestVersion(data.restrictCommentsToLatestVersion)
        setHideFeedback(data.hideFeedback || false)
        setTimestampDisplay(data.timestampDisplay || 'TIMECODE')
        setPreviewResolution(data.previewResolution)
        setWatermarkEnabled(data.watermarkEnabled ?? true)
        setWatermarkText(data.watermarkText || '')
        setUseCustomWatermark(!!data.watermarkText)
        setWatermarkPositions(data.watermarkPositions || 'center')
        setWatermarkOpacity(data.watermarkOpacity ?? 30)
        setWatermarkFontSize(data.watermarkFontSize || 'medium')
        setAllowAssetDownload(data.allowAssetDownload ?? true)
        setAllowClientAssetUpload(data.allowClientAssetUpload ?? false)
        setClientCanApprove(data.clientCanApprove ?? true)
        setUsePreviewForApprovedPlayback(data.usePreviewForApprovedPlayback ?? false)
        setShowClientTutorial(data.showClientTutorial ?? true)
        setAuthMode(data.authMode || 'PASSWORD')
        setGuestMode(data.guestMode || false)
        setGuestLatestOnly(data.guestLatestOnly ?? true)
        setSharePassword(data.sharePassword || '')

        // Store original processing settings
        setOriginalSettings({
          title: data.title,
          previewResolution: data.previewResolution,
          watermarkEnabled: data.watermarkEnabled ?? true,
          watermarkText: data.watermarkText,
          watermarkPositions: data.watermarkPositions || 'center',
          watermarkOpacity: data.watermarkOpacity ?? 30,
          watermarkFontSize: data.watermarkFontSize || 'medium',
        })

        // Check if slug was manually customized (different from auto-generated from title)
        const autoGeneratedSlug = sanitizeSlug(data.title)
        if (data.slug !== autoGeneratedSlug) {
          setUseCustomSlug(true)
          setCustomSlugValue(data.slug)
        }

        // Set due date
        if (data.dueDate) {
          const d = new Date(data.dueDate)
          setDueDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
        }
        setDueReminder(data.dueReminder || 'NONE')

        // Set notification settings
        setClientNotificationSchedule(data.clientNotificationSchedule || 'HOURLY')
        setClientNotificationTime(data.clientNotificationTime || '09:00')
        setClientNotificationDay(data.clientNotificationDay ?? 1)

        // Mark initial load as complete
        setInitialLoadComplete(true)
      } catch (err) {
        setError(t('failedToLoadSettings'))
      } finally {
        setLoading(false)
      }
    }

    loadProject()
  }, [projectId, t])

  // Track if initial load is complete
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)

  // Clear password when switching to NONE mode
  useEffect(() => {
    if (initialLoadComplete && authMode === 'NONE') {
      setSharePassword('')
    }
  }, [authMode, initialLoadComplete])

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess(false)

    try {
      const sanitizedSlug = sanitizeSlug(slug)

      if (!sanitizedSlug) {
        setError(t('shareLinkEmpty'))
        setSaving(false)
        return
      }

      // Validate OTP requirements
      if ((authMode === 'OTP' || authMode === 'BOTH') && !smtpConfigured) {
        setError(t('otpRequiresSMTP'))
        setSaving(false)
        return
      }

      if ((authMode === 'OTP' || authMode === 'BOTH') && !hasRecipientWithEmail) {
        setError(t('otpRequiresRecipients'))
        setSaving(false)
        return
      }

      // Ensure revision values are valid numbers before saving
      const finalMaxRevisions = typeof maxRevisions === 'number' ? maxRevisions : parseInt(String(maxRevisions), 10) || 1

      // Validate: maxRevisions must be at least 1
      if (enableRevisions && finalMaxRevisions < 1) {
        setError(t('maxRevisionsMinError'))
        setSaving(false)
        return
      }

      const updates: any = {
        title,
        slug: sanitizedSlug,
        description: description || null,
        companyName: companyName || null,
        clientCompanyId: clientCompanyId || null,
        enableRevisions,
        maxRevisions: enableRevisions ? finalMaxRevisions : 0,
        restrictCommentsToLatestVersion,
        hideFeedback,
        timestampDisplay,
        previewResolution,
        watermarkEnabled,
        watermarkText: useCustomWatermark ? watermarkText : null,
        watermarkPositions,
        watermarkOpacity,
        watermarkFontSize,
        allowAssetDownload,
        allowClientAssetUpload,
        clientCanApprove,
        usePreviewForApprovedPlayback,
        showClientTutorial,
        sharePassword: sharePassword || null,
        authMode,
        guestMode,
        guestLatestOnly,
        clientNotificationSchedule,
        clientNotificationTime: (clientNotificationSchedule === 'DAILY' || clientNotificationSchedule === 'WEEKLY') ? clientNotificationTime : null,
        clientNotificationDay: clientNotificationSchedule === 'WEEKLY' ? clientNotificationDay : null,
        dueDate: dueDate ? `${dueDate}T12:00:00.000Z` : null,
        dueReminder: dueDate ? dueReminder : null,
      }

      // Detect changes to processing settings
      const currentWatermarkText = useCustomWatermark ? watermarkText : null
      const processingSettingsChanged =
        title !== originalSettings.title ||
        previewResolution !== originalSettings.previewResolution ||
        watermarkEnabled !== originalSettings.watermarkEnabled ||
        currentWatermarkText !== originalSettings.watermarkText ||
        watermarkPositions !== originalSettings.watermarkPositions ||
        watermarkOpacity !== originalSettings.watermarkOpacity ||
        watermarkFontSize !== originalSettings.watermarkFontSize

      // If processing settings changed, show modal
      if (processingSettingsChanged) {
        setPendingUpdates(updates)
        setShowReprocessModal(true)
        setSaving(false)
        return
      }

      // Otherwise save normally
      await saveSettings(updates)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSave'))
      setSaving(false)
    }
  }

  async function saveSettings(updates: any, shouldReprocess = false) {
    setSaving(true)
    setError('')

    try {
      // Save project settings
      await apiPatch(`/api/projects/${projectId}`, updates)

      // Update custom slug value to sanitized version if using custom slug
      const sanitizedSlug = updates.slug
      if (useCustomSlug) {
        setCustomSlugValue(sanitizedSlug)
      }

      // Reprocess videos if requested
      if (shouldReprocess) {
        await reprocessVideos()
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)

      // Reload project data to reflect changes
      const refreshResponse = await apiFetch(`/api/projects/${projectId}`)
      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json()
        setProject(refreshedData)
        setWatermarkEnabled(refreshedData.watermarkEnabled ?? true)
        setWatermarkText(refreshedData.watermarkText || '')
        setUseCustomWatermark(!!refreshedData.watermarkText)
        setWatermarkPositions(refreshedData.watermarkPositions || 'center')
        setWatermarkOpacity(refreshedData.watermarkOpacity ?? 30)
        setWatermarkFontSize(refreshedData.watermarkFontSize || 'medium')

        // Update original settings
        setOriginalSettings({
          title: refreshedData.title,
          previewResolution: refreshedData.previewResolution,
          watermarkEnabled: refreshedData.watermarkEnabled ?? true,
          watermarkText: refreshedData.watermarkText,
          watermarkPositions: refreshedData.watermarkPositions || 'center',
          watermarkOpacity: refreshedData.watermarkOpacity ?? 30,
          watermarkFontSize: refreshedData.watermarkFontSize || 'medium',
        })
      }

      // Refresh the page
      router.refresh()

      // Close modal and reset pending updates
      setShowReprocessModal(false)
      setPendingUpdates(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  async function reprocessVideos() {
    setReprocessing(true)
    try {
      await apiPost(`/api/projects/${projectId}/reprocess`, {})
    } catch (err) {
      logError('Error reprocessing videos:', err)
      // Don't throw - we still want to save settings
    } finally {
      setReprocessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{tc('loading')}</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t('projectNotFound')}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="max-w-4xl mx-auto">
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <Link href={`/admin/projects/${projectId}`}>
                <Button variant="ghost" size="default" className="justify-start px-3">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">{t('backToProject')}</span>
                  <span className="sm:hidden">{tc('back')}</span>
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold">{t('projectSettings')}</h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-1 truncate">{project.title}</p>
              </div>
            </div>

            <Button onClick={handleSave} variant="default" disabled={saving} size="lg" className="w-full sm:w-auto">
              <Save className="w-4 h-4 mr-2" />
              {saving ? tc('saving') : tc('saveChanges')}
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
            <p className="text-xs sm:text-sm text-success font-medium">{t('settingsSaved')}</p>
          </div>
        )}

	        <div className="space-y-4 sm:space-y-6">
	          {/* Project Details */}
	          <CollapsibleSection
	            className="border-border"
	            title={t('projectDetails')}
	            description={t('projectDetailsDescription')}
	            open={showProjectDetails}
	            onOpenChange={setShowProjectDetails}
	            contentClassName="space-y-4 border-t pt-4"
	          >
	              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
	                <div className="space-y-2">
	                  <Label htmlFor="title">{t('titleLabel')}</Label>
	                  <Input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('titlePlaceholderShort')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('titleHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">{t('descriptionLabel')}</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('descriptionPlaceholderShort')}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('descriptionHint')}
                  </p>
                </div>
              </div>

              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="useCustomSlug">{t('customLink')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('customLinkDescription')}
                    </p>
                  </div>
                  <Switch
                    id="useCustomSlug"
                    checked={useCustomSlug}
                    onCheckedChange={setUseCustomSlug}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">{t('shareLink')}</Label>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                      /share/
                    </span>
                    {useCustomSlug ? (
                      <>
                        <Input
                          id="slug"
                          type="text"
                          value={customSlugValue}
                          onChange={(e) => setCustomSlugValue(e.target.value)}
                          placeholder={t('shareLinkPlaceholder')}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setCustomSlugValue(generateRandomSlug())}
                          title={t('generateRandomURL')}
                          className="h-10 w-10 p-0 flex-shrink-0"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Input
                        id="slug"
                        type="text"
                        value={autoGeneratedSlug}
                        disabled
                        className="flex-1 opacity-60"
                      />
                    )}
                  </div>
                  {useCustomSlug && customSlugValue && customSlugValue !== sanitizedSlug && (
                    <p className="text-xs text-warning">
                      {t('willBeSavedAs')} <span className="font-mono font-semibold">{sanitizedSlug}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
	                    {useCustomSlug
	                      ? t('customSlugHint')
	                      : t('autoSlugHint')}
	                  </p>
	                </div>
	              </div>

              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="enableRevisions">{t('enableRevisionTracking')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('enableRevisionTrackingDescription')}
                    </p>
                  </div>
                  <Switch
                    id="enableRevisions"
                    checked={enableRevisions}
                    onCheckedChange={setEnableRevisions}
                  />
                </div>

                {enableRevisions && (
                  <div className="space-y-2">
                    <Label htmlFor="maxRevisions">{t('maxRevisions')}</Label>
                    <Input
                      id="maxRevisions"
                      type="number"
                      min="1"
                      max="20"
                      value={maxRevisions}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '') {
                          setMaxRevisions('')
                        } else {
                          const num = parseInt(val, 10)
                          if (!isNaN(num)) setMaxRevisions(num)
                        }
                      }}
                      onBlur={(e) => {
                        const val = e.target.value
                        if (val === '') {
                          setMaxRevisions(1)
                        } else {
                          const num = parseInt(val, 10)
                          if (isNaN(num) || num < 1) setMaxRevisions(1)
                          else if (num > 20) setMaxRevisions(20)
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('maxRevisionsHint')}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <Label htmlFor="dueDate" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {t('dueDateLabel')}
                </Label>
                <div className="space-y-3">
                  <Input
                    id="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('dueDateHint')}
                  </p>

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

                  {dueDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => { setDueDate(''); setDueReminder('NONE') }}
                    >
                      {t('clearDueDate')}
                    </Button>
                  )}
                </div>
              </div>
	          </CollapsibleSection>

	          {/* Client Information & Notifications */}
	          <CollapsibleSection
	            className="border-border"
	            title={t('clientInfoNotifications')}
	            description={t('clientInfoNotificationsDescription')}
	            open={showClientInfo}
	            onOpenChange={setShowClientInfo}
	            contentClassName="space-y-6 border-t pt-4"
	          >
              {/* Company/Brand Selection */}
              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="companyName">{t('companyBrandName')}</Label>
                  <CompanyNameInput
                    value={companyName}
                    selectedId={clientCompanyId}
                    onChange={(name, id) => {
                      setCompanyName(name)
                      setClientCompanyId(id)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('companyBrandNameHint')}
                  </p>
                </div>
              </div>

              {/* Recipients */}
              <div className="space-y-3">
                <RecipientManager
                  projectId={projectId}
                  companyId={clientCompanyId}
                  onError={setError}
                  onRecipientsChange={setRecipients}
                />
              </div>

              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <ScheduleSelector
                  schedule={clientNotificationSchedule}
                  time={clientNotificationTime}
                  day={clientNotificationDay}
                  onScheduleChange={setClientNotificationSchedule}
                  onTimeChange={setClientNotificationTime}
                  onDayChange={setClientNotificationDay}
                  label={t('clientNotificationSchedule')}
	                  description={t('clientNotificationScheduleDescription')}
	                />
	              </div>
	          </CollapsibleSection>

	          {/* Client Share Page */}
	          <CollapsibleSection
	            className="border-border"
	            title={t('clientSharePage')}
	            description={t('clientSharePageDescription')}
	            open={showClientSharePage}
	            onOpenChange={setShowClientSharePage}
	            contentClassName="space-y-6 border-t pt-4"
	          >
              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="clientCanApprove">{t('allowClientApproval')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('allowClientApprovalDescription')}
                    </p>
                  </div>
                  <Switch
                    id="clientCanApprove"
                    checked={clientCanApprove}
                    onCheckedChange={setClientCanApprove}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="allowAssetDownload">{t('allowAssetDownloads')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('allowAssetDownloadsDescription')}
                    </p>
                  </div>
                  <Switch
                    id="allowAssetDownload"
                    checked={allowAssetDownload}
                    onCheckedChange={setAllowAssetDownload}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="allowClientAssetUpload">{t('allowClientFileAttachments')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('allowClientFileAttachmentsDescription')}
                    </p>
                  </div>
                  <Switch
                    id="allowClientAssetUpload"
                    checked={allowClientAssetUpload}
                    onCheckedChange={setAllowClientAssetUpload}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="showClientTutorial">{t('showClientTutorial')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('showClientTutorialDescription')}
                    </p>
                  </div>
                  <Switch
                    id="showClientTutorial"
                    checked={showClientTutorial}
                    onCheckedChange={setShowClientTutorial}
                  />
                </div>
              </div>

              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="usePreviewForApprovedPlayback">{t('usePreviewForApproved')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('usePreviewForApprovedDescription')}
                    </p>
                  </div>
                  <Switch
                    id="usePreviewForApprovedPlayback"
                    checked={usePreviewForApprovedPlayback}
                    onCheckedChange={setUsePreviewForApprovedPlayback}
                  />
                </div>
                {usePreviewForApprovedPlayback && watermarkEnabled && (
                  <p className="text-xs text-muted-foreground italic">
                    {t('cleanPreviewHint')}
                  </p>
                )}
              </div>

	              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
	                <div className="flex items-center justify-between gap-4">
	                  <div className="space-y-0.5 flex-1">
	                    <Label htmlFor="hideFeedback">{t('hideFeedbackSection')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('hideFeedbackSectionDescription')}
                    </p>
                  </div>
                  <Switch
                    id="hideFeedback"
                    checked={hideFeedback}
                    onCheckedChange={setHideFeedback}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="restrictComments">{t('restrictCommentsLatest')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('restrictCommentsLatestDescription')}
                    </p>
                  </div>
                  <Switch
                    id="restrictComments"
                    checked={restrictCommentsToLatestVersion}
                    onCheckedChange={setRestrictCommentsToLatestVersion}
                  />
                </div>

                <div className="space-y-2 pt-2 mt-2 border-t border-border">
                  <Label>{t('commentTimestampDisplay')}</Label>
                  <Select value={timestampDisplay} onValueChange={(v) => setTimestampDisplay(v as 'AUTO' | 'TIMECODE')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TIMECODE">{t('timecodeFormat')}</SelectItem>
                      <SelectItem value="AUTO">{t('simpleTimeFormat')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('commentTimestampDisplayHint')}
	                  </p>
	                </div>
	              </div>
	          </CollapsibleSection>

	          {/* Video Processing Settings */}
	          <CollapsibleSection
	            className="border-border"
	            title={t('videoProcessing')}
	            description={t('videoProcessingDescription')}
	            open={showVideoProcessing}
	            onOpenChange={setShowVideoProcessing}
	            contentClassName="space-y-6 border-t pt-4"
	          >
	              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
	                <div className="space-y-2">
	                  <Label>{t('previewResolution')}</Label>
	                  <Select value={previewResolution} onValueChange={setPreviewResolution}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">{t('resolution720p')}</SelectItem>
                      <SelectItem value="1080p">{t('resolution1080p')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('previewResolutionHint')}
                  </p>
                </div>
              </div>

              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="watermarkEnabled">{t('enableWatermarks')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('enableWatermarksDescription')}
                    </p>
                  </div>
                  <Switch
                    id="watermarkEnabled"
                    checked={watermarkEnabled}
                    onCheckedChange={setWatermarkEnabled}
                  />
                </div>

                {watermarkEnabled && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="customWatermark">{t('customWatermarkText')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t('customWatermarkTextDescription')}
                        </p>
                      </div>
                      <Switch
                        id="customWatermark"
                        checked={useCustomWatermark}
                        onCheckedChange={setUseCustomWatermark}
                      />
                    </div>

                    {useCustomWatermark && (
                      <div className="space-y-2">
                        <Input
                          value={watermarkText}
                          onChange={(e) => setWatermarkText(e.target.value)}
                          placeholder={t('watermarkPlaceholder')}
                          className="font-mono"
                          maxLength={100}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('watermarkDefaultHint', { title: project?.title })}
                          <br />
                          <span className="text-warning">{t('watermarkAllowedChars')}</span>
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 pt-2 border-t border-border">
                      <Label>{t('watermarkPositions')}</Label>
                      <p className="text-xs text-muted-foreground">{t('watermarkPositionsHint')}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((pos) => {
                          const selected = watermarkPositions.split(',').map(p => p.trim()).includes(pos)
                          return (
                            <button
                              key={pos}
                              type="button"
                              onClick={() => {
                                const current = new Set(watermarkPositions.split(',').map(p => p.trim()).filter(Boolean))
                                if (current.has(pos)) {
                                  current.delete(pos)
                                  if (current.size === 0) return
                                } else {
                                  current.add(pos)
                                }
                                setWatermarkPositions(Array.from(current).join(','))
                              }}
                              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                                selected
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'
                              }`}
                            >
                              {t(`position.${pos}`)}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t('watermarkFontSize')}</Label>
                      <Select value={watermarkFontSize} onValueChange={setWatermarkFontSize}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">{t('fontSizeSmall')}</SelectItem>
                          <SelectItem value="medium">{t('fontSizeMedium')}</SelectItem>
                          <SelectItem value="large">{t('fontSizeLarge')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>{t('watermarkOpacity')}</Label>
                        <span className="text-xs text-muted-foreground">{watermarkOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={watermarkOpacity}
                        onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t('opacitySubtle')}</span>
                        <span>{t('opacityBold')}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
	          </CollapsibleSection>

	          {/* Security Settings */}
	          <CollapsibleSection
	            className="border-border"
	            title={t('security')}
	            description={t('securityDescription')}
	            open={showSecurity}
	            onOpenChange={setShowSecurity}
	            contentClassName="space-y-4 border-t pt-4"
	          >
	              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
	                <div className="space-y-2">
	                  <Label>{t('authMethod')}</Label>
	                  <Select value={authMode} onValueChange={setAuthMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PASSWORD">{t('passwordOnly')}</SelectItem>
                      <SelectItem value="OTP" disabled={!smtpConfigured || !hasRecipientWithEmail}>
                        {t('otpOnly')} {!smtpConfigured || !hasRecipientWithEmail ? t('requiresSMTP') : ''}
                      </SelectItem>
                      <SelectItem value="BOTH" disabled={!smtpConfigured || !hasRecipientWithEmail}>
                        {t('bothAuth')} {!smtpConfigured || !hasRecipientWithEmail ? t('requiresSMTP') : ''}
                      </SelectItem>
                      <SelectItem value="NONE">{t('noAuth')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {authMode === 'PASSWORD' && t('passwordDescriptionLong')}
                    {authMode === 'OTP' && t('otpDescriptionLong')}
                    {authMode === 'BOTH' && t('bothDescriptionLong')}
                    {authMode === 'NONE' && t('noAuthDescription')}
                  </p>
                  {!smtpConfigured && authMode !== 'NONE' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('configureSMTPLong')}
                    </p>
                  )}
                  {smtpConfigured && !hasRecipientWithEmail && authMode !== 'NONE' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('addRecipientForOtp')}
                    </p>
                  )}
                </div>

                {authMode === 'NONE' && (
                  <div className="flex items-start gap-2 p-3 bg-warning-visible border-2 border-warning-visible rounded-md">
                    <span className="text-warning text-sm font-bold">!</span>
                    <p className="text-sm text-warning font-medium">
                      {guestMode ? t('noAuthWarningGuest') : t('noAuthWarningFull')}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="guestMode">{t('guestMode')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('guestModeDescription')}
                    </p>
                  </div>
                  <Switch
                    id="guestMode"
                    checked={guestMode}
                    onCheckedChange={setGuestMode}
                  />
                </div>

                {authMode === 'NONE' && !guestMode && (
                  <div className="flex items-start gap-2 p-3 bg-primary-visible border border-primary-visible rounded-md">
                    <span className="text-primary text-sm font-bold">i</span>
                    <p className="text-sm text-primary">
                      <strong>{t('recommended')}:</strong> {t('guestModeRecommendation')}
                    </p>
                  </div>
                )}

                {guestMode && (
                  <div className="flex items-center justify-between gap-4 pt-2 mt-2 border-t border-border">
                    <div className="space-y-0.5 flex-1">
                      <Label htmlFor="guestLatestOnly">{t('restrictToLatestVersion')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('restrictToLatestVersionDescription')}
                      </p>
                    </div>
                    <Switch
                      id="guestLatestOnly"
                      checked={guestLatestOnly}
                      onCheckedChange={setGuestLatestOnly}
                    />
                  </div>
                )}

                {authMode === 'NONE' && !guestMode && (
                  <div className="flex items-start gap-2 p-2 bg-warning-visible/50 border border-warning-visible rounded-md">
                    <span className="text-warning text-xs font-bold">!</span>
                    <p className="text-xs text-warning font-medium">
                      {t('guestModeRecommendedWarning')}
                    </p>
                  </div>
                )}
              </div>

              {(authMode === 'PASSWORD' || authMode === 'BOTH') && (
              <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('sharePagePassword')}</Label>
                  <div className="flex gap-2 w-full">
                    <PasswordInput
                      id="password"
                      value={sharePassword}
                      onChange={(e) => setSharePassword(e.target.value)}
                      placeholder={t('enterPassword')}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSharePassword(generateSecurePassword())}
                      title={t('generatePassword')}
                      className="h-10 w-10 p-0 flex-shrink-0"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    {sharePassword && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={copyPassword}
                        title={copiedPassword ? tc('copied') : t('copyPassword')}
                        className="h-10 w-10 p-0 flex-shrink-0"
                      >
                        {copiedPassword ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                  {sharePassword && (
                    <SharePasswordRequirements password={sharePassword} />
                  )}
                  <p className="text-xs text-muted-foreground">
	                    {t('sharePagePasswordHint')}
	                  </p>
	                </div>
	              </div>
	              )}
	          </CollapsibleSection>

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
            <p className="text-xs sm:text-sm text-success font-medium">{t('settingsSaved')}</p>
          </div>
        )}

        {/* Save button at bottom */}
        <div className="mt-6 sm:mt-8 pb-20 lg:pb-24 flex justify-end">
          <Button onClick={handleSave} variant="default" disabled={saving} size="lg" className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {saving ? tc('saving') : tc('saveChanges')}
          </Button>
        </div>

        <ReprocessModal
          show={showReprocessModal}
          onCancel={() => {
            setShowReprocessModal(false)
            setPendingUpdates(null)
            setSaving(false)
          }}
          onSaveWithoutReprocess={() => saveSettings(pendingUpdates, false)}
          onSaveAndReprocess={() => saveSettings(pendingUpdates, true)}
          saving={saving}
          reprocessing={reprocessing}
        />
        </div>
      </div>
    </div>
  )
}
