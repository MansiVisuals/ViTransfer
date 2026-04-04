'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { FolderKanban, Plus, Video, Eye, Download, EyeOff, RefreshCw, Copy, Check, Mail, AlertCircle, ImageIcon } from 'lucide-react'
import ProjectsList from '@/components/ProjectsList'
import { apiFetch, apiPost } from '@/lib/api-client'
import { logError } from '@/lib/logging'
import { useTranslations } from 'next-intl'
import { SharePasswordRequirements } from '@/components/SharePasswordRequirements'
import { ClientSelector } from '@/components/ClientSelector'
import { generateSecurePassword } from '@/lib/password-utils'

interface AnalyticsOverview {
  totalProjects: number
  totalVideos: number
  totalVisits: number
  totalDownloads: number
}

export default function AdminPage() {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const router = useRouter()
  const [projects, setProjects] = useState<any[] | null>(null)
  const [analyticsData, setAnalyticsData] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => {
    // Load filter from localStorage or use default (all except ARCHIVED)
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('admin_projects_status_filter')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          return new Set(parsed)
        } catch {
          // If parsing fails, use default
        }
      }
    }
    return new Set(['IN_REVIEW', 'APPROVED', 'SHARE_ONLY'])
  })

  // New Project Modal state
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isShareOnly, setIsShareOnly] = useState(false)
  const [passwordProtected, setPasswordProtected] = useState(true)
  const [sharePassword, setSharePassword] = useState('')
  const [showPassword, setShowPassword] = useState(true)
  const [copied, setCopied] = useState(false)
  const [authMode, setAuthMode] = useState<'PASSWORD' | 'OTP' | 'BOTH'>('PASSWORD')
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [projectTitle, setProjectTitle] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [clientCompanyId, setClientCompanyId] = useState<string | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [projectType, setProjectType] = useState<'VIDEO' | 'PHOTO'>('VIDEO')

  // Save filter to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('admin_projects_status_filter', JSON.stringify(Array.from(statusFilter)))
  }, [statusFilter])

  // Check if SMTP is configured
  async function checkSmtpConfiguration() {
    try {
      const res = await apiFetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        setSmtpConfigured(data.smtpConfigured !== false)
      }
    } catch (err) {
      logError('Failed to check SMTP configuration:', err)
    }
  }

  const loadProjects = async () => {
    try {
      // Fetch projects and analytics in parallel
      const [projectsRes, analyticsRes] = await Promise.all([
        apiFetch('/api/projects'),
        apiFetch('/api/analytics')
      ])

      if (projectsRes.ok) {
        const data = await projectsRes.json()
        setProjects(data.projects || data || [])
      } else {
        setProjects([])
      }

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json()
        const projectsList = analyticsData.projects || []
        setAnalyticsData(projectsList)
      }
    } catch (error) {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
    checkSmtpConfiguration()
  }, [])

  // Password helpers
  function handleGeneratePassword() {
    setSharePassword(generateSecurePassword())
    setCopied(false)
  }

  function handleCopyPassword() {
    navigator.clipboard.writeText(sharePassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Open new project modal
  function openNewProjectModal() {
    setProjectTitle('')
    setProjectDescription('')
    setCompanyName('')
    setClientCompanyId(null)
    setRecipientName('')
    setRecipientEmail('')
    setIsShareOnly(false)
    setPasswordProtected(true)
    setSharePassword(generateSecurePassword())
    setShowPassword(true)
    setCopied(false)
    setAuthMode('PASSWORD')
    setFormError('')
    setProjectType('VIDEO')
    setShowNewProjectModal(true)
  }

  // Create project
  async function handleCreateProject() {
    if (!projectTitle.trim()) {
      setFormError(t('titleRequired2'))
      return
    }

    // Client-side validation for password modes
    const needsPasswordForMode = passwordProtected && (authMode === 'PASSWORD' || authMode === 'BOTH')
    if (needsPasswordForMode && !sharePassword.trim()) {
      setFormError(t('passwordRequired'))
      return
    }

    setCreating(true)
    setFormError('')

    try {
      const data: Record<string, unknown> = {
        title: projectTitle,
        type: projectType,
        authMode: passwordProtected ? authMode : 'NONE',
        isShareOnly: isShareOnly,
      }
      
      // Only include optional fields if they have values
      if (projectDescription) data.description = projectDescription
      if (companyName) data.companyName = companyName
      if (clientCompanyId) data.clientCompanyId = clientCompanyId
      if (recipientName) data.recipientName = recipientName
      if (recipientEmail) data.recipientEmail = recipientEmail
      
      // Only include password for password-based auth modes
      if ((authMode === 'PASSWORD' || authMode === 'BOTH') && passwordProtected && sharePassword) {
        data.sharePassword = sharePassword
      }

      const project = await apiPost('/api/projects', data)
      setShowNewProjectModal(false)
      router.push(`/admin/projects/${project.id}`)
    } catch (error) {
      if (error instanceof Error) {
        setFormError(error.message || t('failedToCreateProject'))
      } else {
        setFormError(t('failedToCreateProject'))
      }
    } finally {
      setCreating(false)
    }
  }

  const canUseOTP = smtpConfigured && recipientEmail
  const showOTPRecommendation = recipientEmail && smtpConfigured && authMode === 'PASSWORD'
  const needsPassword = authMode === 'PASSWORD' || authMode === 'BOTH'

  // Render new project modal
  function renderNewProjectModal() {
    return (
      <Dialog open={showNewProjectModal} onOpenChange={setShowNewProjectModal}>
        <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-3rem)] sm:max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-primary" />
              {t('createNew')}
            </DialogTitle>
            <DialogDescription>
              {t('createDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4 -mx-4 px-4 sm:-mx-6 sm:px-6">
            {formError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-sm text-destructive">{formError}</span>
              </div>
            )}

            {/* Project Title */}
            <div className="space-y-2">
              <Label htmlFor="projectTitle">{t('titleRequired')}</Label>
              <Input
                id="projectTitle"
                placeholder={t('titlePlaceholder')}
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="projectDescription">{t('descriptionOptional')}</Label>
              <Textarea
                id="projectDescription"
                placeholder={t('descriptionPlaceholder')}
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Project Type Selector */}
            <div className="space-y-3">
              <Label>{t('projectType')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProjectType('VIDEO')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                    projectType === 'VIDEO'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <Video className={`w-5 h-5 ${projectType === 'VIDEO' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-medium ${projectType === 'VIDEO' ? 'text-primary' : 'text-foreground'}`}>{t('videoProject')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProjectType('PHOTO')}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                    projectType === 'PHOTO'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <ImageIcon className={`w-5 h-5 ${projectType === 'PHOTO' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-medium ${projectType === 'PHOTO' ? 'text-primary' : 'text-foreground'}`}>{t('photoProject')}</span>
                </button>
              </div>
            </div>

            {/* Client Selection */}
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
              disabled={creating}
            />

            {/* Authentication Section */}
            <div className="space-y-4 border rounded-lg p-4 bg-primary-visible border-2 border-primary-visible">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <Label htmlFor="passwordProtected" className="text-sm font-semibold">
                    {t('requireAuth')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('requireAuthDescription')}
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
                <div className="space-y-3 pt-2 border-t">
                  {/* Authentication Method */}
                  <div className="space-y-2">
                    <Label>{t('authMethod')}</Label>
                    <Select value={authMode} onValueChange={(v) => setAuthMode(v as 'PASSWORD' | 'OTP' | 'BOTH')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PASSWORD">{t('passwordOnly')}</SelectItem>
                        <SelectItem value="OTP" disabled={!canUseOTP}>
                          {t('otpOnly')} {!canUseOTP ? t('requiresSMTP') : ''}
                        </SelectItem>
                        <SelectItem value="BOTH" disabled={!canUseOTP}>
                          {t('bothAuth')} {!canUseOTP ? t('requiresSMTP') : ''}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {authMode === 'PASSWORD' && t('passwordDescription')}
                      {authMode === 'OTP' && t('otpDescription')}
                      {authMode === 'BOTH' && t('bothDescription')}
                    </p>

                    {/* Smart Recommendation */}
                    {showOTPRecommendation && (
                      <div className="flex items-start gap-2 p-2 bg-muted border border-border rounded-md">
                        <Mail className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{t('considerOtp')}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('considerOtpDescription')}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2"
                              onClick={() => setAuthMode('OTP')}
                            >
                              {t('otpOnlyShort')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2"
                              onClick={() => setAuthMode('BOTH')}
                            >
                              {t('bothShort')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {!smtpConfigured && (
                      <div className="flex items-start gap-2 p-2 bg-warning-visible border border-warning-visible rounded-md">
                        <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-warning">
                          {t('configureSMTP')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Password Field */}
                  {needsPassword && (
                    <div className="space-y-2">
                      <Label htmlFor="sharePassword">{t('sharePassword')}</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1 min-w-0">
                          <Input
                            id="sharePassword"
                            value={sharePassword}
                            onChange={(e) => setSharePassword(e.target.value)}
                            type={showPassword ? 'text' : 'password'}
                            className="pr-10 font-mono text-sm"
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
                          className="flex-shrink-0"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={handleCopyPassword}
                          title={t('copyPassword')}
                          className="flex-shrink-0"
                        >
                          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                      {sharePassword && (
                        <SharePasswordRequirements password={sharePassword} />
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t('savePasswordWarning')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!passwordProtected && (
                <div className="flex items-start gap-2 p-2 bg-warning-visible border-2 border-warning-visible rounded-md">
                  <span className="text-warning text-sm font-bold">!</span>
                  <p className="text-xs text-warning font-medium">
                    {t('noAuthWarning')}
                  </p>
                </div>
              )}
            </div>

            {/* Share Only */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center space-x-2">
                <input
                  id="isShareOnly"
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
                {t('shareOnlyDescription')}
              </p>
            </div>

            <p className="text-xs text-muted-foreground border-t pt-3">
              {t('additionalOptions')}
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={creating}>{tc('cancel')}</Button>
            </DialogClose>
            <Button onClick={handleCreateProject} disabled={creating}>
              <Plus className="w-4 h-4 mr-2" />
              {creating ? tc('creating') : t('createProject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Calculate analytics based on current filter
  const analytics: AnalyticsOverview | null = analyticsData
    ? (() => {
        const filteredAnalytics = analyticsData.filter((p: any) => statusFilter.has(p.status))
        return {
          totalProjects: filteredAnalytics.length,
          totalVideos: filteredAnalytics.reduce((sum: number, p: any) => sum + (p.videoCount || 0), 0),
          totalVisits: filteredAnalytics.reduce((sum: number, p: any) => sum + (p.totalVisits || 0), 0),
          totalDownloads: filteredAnalytics.reduce((sum: number, p: any) => sum + (p.totalDownloads || 0), 0),
        }
      })()
    : null

  const metricIconWrapperClassName = 'rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10'
  const metricIconClassName = 'w-4 h-4 text-primary'

  if (loading) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t('loadingProjects')}</p>
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="flex-1 min-h-0 bg-background">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
          <div className="flex justify-between items-center gap-4 mb-4 sm:mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                <FolderKanban className="w-7 h-7 sm:w-8 sm:h-8" />
                {t('dashboard')}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t('dashboardDescription')}</p>
            </div>
            <Button variant="default" size="default" onClick={openNewProjectModal}>
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('newProject')}</span>
            </Button>
          </div>
          <div className="text-muted-foreground">{t('noProjects')}</div>
        </div>
        {renderNewProjectModal()}
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="flex justify-between items-center gap-4 mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <FolderKanban className="w-7 h-7 sm:w-8 sm:h-8" />
              {t('dashboard')}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t('dashboardDescription')}</p>
          </div>
          <Button variant="default" size="default" onClick={openNewProjectModal}>
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('newProject')}</span>
          </Button>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <Card className="p-3 mb-4">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <FolderKanban className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t('projectsCount')}</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalProjects.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Video className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t('videos')}</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalVideos.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Eye className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t('visits')}</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalVisits.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Download className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t('downloads')}</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalDownloads.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </Card>
        )}

        <ProjectsList 
          projects={projects} 
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      </div>
      {renderNewProjectModal()}
    </div>
  )
}
