'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink, LogOut, Loader2, FolderOpen } from 'lucide-react'

interface PortalProject {
  id: string
  slug: string
  title: string
  status: 'IN_REVIEW' | 'APPROVED'
  dueDate: string | null
  lastActivityAt: string
}

interface Props {
  token: string
  onLogout: () => void
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

export default function PortalDashboard({ token, onLogout }: Props) {
  const t = useTranslations('portal')
  const tc = useTranslations('common')
  const [projects, setProjects] = useState<PortalProject[] | null>(null)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en'

  const fetchProjects = useCallback(async () => {
    setError('')
    try {
      const res = await fetch('/api/portal/projects', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (res.status === 401) {
        onLogout()
        return
      }
      if (!res.ok) {
        setError(t('failedToLoad'))
        return
      }
      const data = await res.json()
      setProjects(data.projects || [])
    } catch {
      setError(t('failedToLoad'))
    }
  }, [token, onLogout, t])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await fetch('/api/portal/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // ignore
    } finally {
      onLogout()
    }
  }

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{t('dashboardTitle')}</h1>
        <Button variant="outline" size="sm" onClick={handleLogout} disabled={loggingOut}>
          <LogOut className="w-4 h-4" />
          {t('logout')}
        </Button>
      </div>

      {error && (
        <Card className="bg-card border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchProjects}>
              {tc('errorTryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {!projects && !error && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {projects && projects.length === 0 && !error && (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center space-y-3">
            <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">{t('empty')}</p>
          </CardContent>
        </Card>
      )}

      {projects && projects.length > 0 && (
        <div className="space-y-3">
          {projects.map((p) => (
            <Card key={p.id} className="bg-card border-border">
              <CardContent className="py-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-foreground truncate">{p.title}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={
                        p.status === 'IN_REVIEW'
                          ? 'inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium'
                          : 'inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium'
                      }
                    >
                      {p.status === 'IN_REVIEW' ? t('statusReview') : t('statusApproved')}
                    </span>
                    {p.dueDate && (
                      <span className="text-muted-foreground">
                        {t('dueDate', { date: formatDate(p.dueDate, locale) })}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {t('updatedAt', { date: formatDate(p.lastActivityAt, locale) })}
                    </span>
                  </div>
                </div>
                <a
                  href={`/share/${encodeURIComponent(p.slug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button size="sm" aria-label={t('openInNewTab')}>
                    <ExternalLink className="w-4 h-4" />
                    {t('openButton')}
                  </Button>
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
