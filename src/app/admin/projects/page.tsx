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
import { FolderKanban, Plus, Video, Eye, Download, EyeOff, RefreshCw, Copy, Check, X, Mail, AlertCircle } from 'lucide-react'
import ProjectsList from '@/components/ProjectsList'
import { apiFetch, apiPost } from '@/lib/api-client'
import { SharePasswordRequirements } from '@/components/SharePasswordRequirements'
import { ClientSelector } from '@/components/ClientSelector'

interface AnalyticsOverview {
  totalProjects: number
  totalVideos: number
  totalVisits: number
  totalDownloads: number
}

// Client-safe password generation using Web Crypto API
function generateSecurePassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'
  const numbers = '23456789'
  const special = '!@#$%'
  const all = letters + numbers + special

  const getRandomInt = (max: number) => {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    return array[0] % max
  }

  let password = ''
  password += letters.charAt(getRandomInt(letters.length))
  password += numbers.charAt(getRandomInt(numbers.length))

  for (let i = 2; i < 12; i++) {
    password += all.charAt(getRandomInt(all.length))
  }

  // Fisher-Yates shuffle
  const chars = password.split('')
  for (let i = chars.length - 1; i > 0; i--) {
    const j = getRandomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}

export default function AdminPage() {
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
      console.error('Failed to check SMTP configuration:', err)
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
    setShowNewProjectModal(true)
  }

  // Create project
  async function handleCreateProject() {
    if (!projectTitle.trim()) {
      setFormError('Project title is required')
      return
    }

    // Client-side validation for password modes
    const needsPasswordForMode = passwordProtected && (authMode === 'PASSWORD' || authMode === 'BOTH')
    if (needsPasswordForMode && !sharePassword.trim()) {
      setFormError('Password is required for password authentication mode')
      return
    }

    setCreating(true)
    setFormError('')

    try {
      const data: Record<string, unknown> = {
        title: projectTitle,
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
        setFormError(error.message || 'Failed to create project')
      } else {
        setFormError('Failed to create project')
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
              Create New Project
            </DialogTitle>
            <DialogDescription>
              Set up a new video project for your client
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
              <Label htmlFor="projectTitle">Project Title *</Label>
              <Input
                id="projectTitle"
                placeholder="e.g., Video Project - Client Name"
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
              <Label htmlFor="projectDescription">Description (Optional)</Label>
              <Textarea
                id="projectDescription"
                placeholder="e.g., Project details, deliverables, notes..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={2}
              />
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
                    Require Authentication
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Clients must authenticate to view and approve.
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
                    <Label>Authentication Method</Label>
                    <Select value={authMode} onValueChange={(v) => setAuthMode(v as 'PASSWORD' | 'OTP' | 'BOTH')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PASSWORD">Password Only</SelectItem>
                        <SelectItem value="OTP" disabled={!canUseOTP}>
                          Email OTP Only {!canUseOTP ? '(requires SMTP & email)' : ''}
                        </SelectItem>
                        <SelectItem value="BOTH" disabled={!canUseOTP}>
                          Both Password and OTP {!canUseOTP ? '(requires SMTP & email)' : ''}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {authMode === 'PASSWORD' && 'Clients must enter a password to access'}
                      {authMode === 'OTP' && 'Clients receive a one-time code via email'}
                      {authMode === 'BOTH' && 'Clients can choose password or email OTP'}
                    </p>

                    {/* Smart Recommendation */}
                    {showOTPRecommendation && (
                      <div className="flex items-start gap-2 p-2 bg-muted border border-border rounded-md">
                        <Mail className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">Consider Email OTP</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            No password sharing needed.
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2"
                              onClick={() => setAuthMode('OTP')}
                            >
                              OTP Only
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2"
                              onClick={() => setAuthMode('BOTH')}
                            >
                              Both
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {!smtpConfigured && (
                      <div className="flex items-start gap-2 p-2 bg-warning-visible border border-warning-visible rounded-md">
                        <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-warning">
                          Configure SMTP in Settings for OTP options
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Password Field */}
                  {needsPassword && (
                    <div className="space-y-2">
                      <Label htmlFor="sharePassword">Share Password</Label>
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
                          title="Generate new password"
                          className="flex-shrink-0"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={handleCopyPassword}
                          title="Copy password"
                          className="flex-shrink-0"
                        >
                          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                      {sharePassword && (
                        <SharePasswordRequirements password={sharePassword} />
                      )}
                      <p className="text-xs text-muted-foreground">
                        <strong className="text-warning">Important:</strong> Save this password to share with your client.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!passwordProtected && (
                <div className="flex items-start gap-2 p-2 bg-warning-visible border-2 border-warning-visible rounded-md">
                  <span className="text-warning text-sm font-bold">!</span>
                  <p className="text-xs text-warning font-medium">
                    Anyone with the link can view and approve without authentication.
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
                  Share Only
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Pre-approved project for simple video sharing. Disables feedback.
              </p>
            </div>

            <p className="text-xs text-muted-foreground border-t pt-3">
              Additional options can be configured in Project Settings after creation.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={creating}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleCreateProject} disabled={creating}>
              <Plus className="w-4 h-4 mr-2" />
              {creating ? 'Creating...' : 'Create Project'}
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
        <p className="text-muted-foreground">Loading projects...</p>
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
                Projects Dashboard
              </h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">Manage video projects and deliverables</p>
            </div>
            <Button variant="default" size="default" onClick={openNewProjectModal}>
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">New Project</span>
            </Button>
          </div>
          <div className="text-muted-foreground">No projects found.</div>
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
              Projects Dashboard
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">Manage video projects and deliverables</p>
          </div>
          <Button variant="default" size="default" onClick={openNewProjectModal}>
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">New Project</span>
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
                  <p className="text-xs text-muted-foreground">Projects</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalProjects.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Video className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Videos</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalVideos.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Eye className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Visits</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalVisits.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Download className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Downloads</p>
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
