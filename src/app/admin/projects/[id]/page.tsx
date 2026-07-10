'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import AdminVideoManager from '@/components/AdminVideoManager'
import ProjectActions from '@/components/ProjectActions'
import ProjectUploadsBlock from '@/components/ProjectUploadsBlock'
import PhotoAlbumsBlock from '@/components/PhotoAlbumsBlock'
import { ArrowLeft, Settings, ArrowUpDown, Video, FolderUp, Images, ChevronDown, ChevronUp } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { useTranslations } from 'next-intl'
import { logError } from '@/lib/logging'

// Force dynamic rendering (no static pre-rendering)
export const dynamic = 'force-dynamic'

const SECTIONS_COLLAPSED_KEY = 'vitransfer-admin-project-sections-collapsed'

export default function ProjectPage() {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [shareUrl, setShareUrl] = useState('')
  const [sortMode, setSortMode] = useState<'status' | 'alphabetical'>('alphabetical')
  const [albumSortMode, setAlbumSortMode] = useState<'date' | 'alphabetical'>('date')
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [photoCounts, setPhotoCounts] = useState<{ albums: number; photos: number } | null>(null)
  const [uploadsCount, setUploadsCount] = useState<number | null>(null)

  const handlePhotoCounts = useCallback((albumCount: number, photoCount: number) => {
    setPhotoCounts({ albums: albumCount, photos: photoCount })
  }, [])

  const handleUploadsCount = useCallback((count: number) => {
    setUploadsCount(count)
  }, [])

  // Restore per-section collapse state (shared across projects)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SECTIONS_COLLAPSED_KEY)
      if (raw) setCollapsedSections(JSON.parse(raw))
    } catch {}
  }, [])

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(SECTIONS_COLLAPSED_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  // Fetch project data function (extracted so it can be called on upload complete)
  const fetchProject = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/projects/${id}`)
      if (!response.ok) {
        if (response.status === 404) {
          router.push('/admin/projects')
          return
        }
        throw new Error('Failed to fetch project')
      }
      const data = await response.json()
      setProject(data)
    } catch (error) {
      logError('Error fetching project:', error)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  // Fetch project data on mount
  useEffect(() => {
    fetchProject()
  }, [fetchProject])

  // Listen for immediate updates (approval changes, comment deletes/posts, etc.)
  useEffect(() => {
    const handleUpdate = () => fetchProject()

    const handleCommentPosted = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail?.comments) {
        setProject((prev: any) => prev ? { ...prev, comments: customEvent.detail.comments } : prev)
      } else {
        fetchProject()
      }
    }

    window.addEventListener('videoApprovalChanged', handleUpdate)
    window.addEventListener('commentDeleted', handleUpdate)
    window.addEventListener('commentPosted', handleCommentPosted as EventListener)

    return () => {
      window.removeEventListener('videoApprovalChanged', handleUpdate)
      window.removeEventListener('commentDeleted', handleUpdate)
      window.removeEventListener('commentPosted', handleCommentPosted as EventListener)
    }
  }, [fetchProject])

  // Auto-refresh when videos are processing to show real-time progress
  // Centralized polling to prevent duplicate network requests
  useEffect(() => {
    if (!project?.videos) return

    // Check if any videos are currently processing
    const hasProcessingVideos = project.videos.some(
      (video: any) => video.status === 'PROCESSING' || video.status === 'UPLOADING'
    )

    if (hasProcessingVideos) {
      // Poll every 5 seconds while videos are processing (reduced from 3s to reduce load)
      const interval = setInterval(() => {
        fetchProject()
      }, 5000)

      return () => clearInterval(interval)
    }
  }, [project?.videos, fetchProject])

  // Fetch share URL
  useEffect(() => {
    async function fetchShareUrl() {
      if (!project?.slug) return
      try {
        const response = await apiFetch(`/api/share/url?slug=${project.slug}`)
        if (response.ok) {
          const data = await response.json()
          setShareUrl(data.shareUrl)
        }
      } catch (error) {
        logError('Error fetching share URL:', error)
      }
    }

    fetchShareUrl()
  }, [project?.slug])


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
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('projectNotFound')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Filter comments to only show comments for active videos
  const iconBadgeClassName = 'rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10'
  const iconBadgeIconClassName = 'w-4 h-4 text-primary'
  const countBadgeClassName = 'text-sm font-normal text-muted-foreground'

  const videoGroupNames: string[] = Array.from(new Set(project.videos.map((v: any) => v.name)))

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Link href="/admin/projects">
            <Button variant="outline" size="default" className="justify-start px-3">
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">{t('backToProjects')}</span>
              <span className="sm:hidden">{tc('back')}</span>
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Link href={`/admin/projects/${id}/settings`}>
              <Button variant="outline" size="default">
                <Settings className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('projectSettings')}</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Actions Panel - Top on mobile, right on desktop */}
          <div className="lg:col-start-3 lg:row-start-1 min-w-0">
            <ProjectActions
              project={project}
              videos={project.videos}
              onRefresh={fetchProject}
              shareUrl={shareUrl}
              recipients={project.recipients || []}
            />
          </div>

          {/* Videos Section - Below actions on mobile, left on desktop */}
          <div className="lg:col-span-2 lg:row-start-1 space-y-6 min-w-0">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleSection('videos')}
                    aria-expanded={!collapsedSections.videos}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    <span className={iconBadgeClassName}>
                      <Video className={iconBadgeIconClassName} />
                    </span>
                    {t('videos')}
                    {project.videos.length > 0 && (
                      <span className={countBadgeClassName}>{videoGroupNames.length}</span>
                    )}
                    {collapsedSections.videos
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </h2>
                {!collapsedSections.videos && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSortMode(current => current === 'status' ? 'alphabetical' : 'status')}
                    className="text-muted-foreground hover:text-foreground"
                    title={sortMode === 'status' ? t('sortAlphabetically') : t('sortByStatus')}
                  >
                    <ArrowUpDown className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {/* Hidden, not unmounted — keeps upload queue state alive while collapsed */}
              <div className={collapsedSections.videos ? 'hidden' : undefined}>
                <AdminVideoManager
                  projectId={project.id}
                  videos={project.videos}
                  projectStatus={project.status}
                  restrictToLatestVersion={project.restrictCommentsToLatestVersion}
                  onRefresh={fetchProject}
                  sortMode={sortMode}
                  maxRevisions={project.maxRevisions}
                  enableRevisions={project.enableRevisions}
                />
              </div>
            </div>

            {/* Photo albums */}
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleSection('photos')}
                    aria-expanded={!collapsedSections.photos}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    <span className={iconBadgeClassName}>
                      <Images className={iconBadgeIconClassName} />
                    </span>
                    {t('photoAlbums')}
                    {photoCounts !== null && photoCounts.albums > 0 && (
                      <span className={countBadgeClassName}>{photoCounts.albums}</span>
                    )}
                    {collapsedSections.photos
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </h2>
                {!collapsedSections.photos && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAlbumSortMode(current => current === 'date' ? 'alphabetical' : 'date')}
                    className="text-muted-foreground hover:text-foreground"
                    title={albumSortMode === 'date' ? t('sortAlphabetically') : t('sortByDate')}
                  >
                    <ArrowUpDown className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className={collapsedSections.photos ? 'hidden' : undefined}>
                <PhotoAlbumsBlock projectId={project.id} sortMode={albumSortMode} onCountsChange={handlePhotoCounts} />
              </div>
            </div>

            {/* Client Uploads block — only shown when reverse share is enabled */}
            {project.allowReverseShare && (
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSection('clientUploads')}
                      aria-expanded={!collapsedSections.clientUploads}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <span className={iconBadgeClassName}>
                        <FolderUp className={iconBadgeIconClassName} />
                      </span>
                      {t('clientUploads')}
                      {uploadsCount !== null && uploadsCount > 0 && (
                        <span className={countBadgeClassName}>{uploadsCount}</span>
                      )}
                      {collapsedSections.clientUploads
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </h2>
                </div>
                <div className={collapsedSections.clientUploads ? 'hidden' : undefined}>
                  <ProjectUploadsBlock projectId={project.id} onCountChange={handleUploadsCount} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
