'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Shield, AlertTriangle, Info, XCircle, Trash2, RefreshCw, ChevronRight, ChevronDown, Unlock, Tag, ShieldX } from 'lucide-react'
import FilterDropdown from '@/components/FilterDropdown'
import { formatDateTime } from '@/lib/utils'
import { apiDelete, apiFetch } from '@/lib/api-client'
import { logError } from '@/lib/logging'
import {
  formatSecurityEventType,
  getSecurityEventDescription,
  getSecurityEventCategory,
  formatIpAddress,
  formatSessionId
} from '@/lib/security-events'

interface SecurityEvent {
  id: string
  type: string
  severity: string
  projectId?: string
  videoId?: string
  sessionId?: string
  ipAddress?: string
  referer?: string
  details?: any
  wasBlocked: boolean
  createdAt: string
  project?: {
    id: string
    title: string
    slug: string
  }
}

interface SecurityEventsResponse {
  events: SecurityEvent[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
  stats: Array<{
    type: string
    count: number
  }>
}

interface RateLimitEntry {
  key: string
  lockoutUntil: number
  count: number
  type: string
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 10

export default function SecurityEventsClient() {
  const t = useTranslations('security')
  const tc = useTranslations('common')
  const SEVERITY_OPTIONS = [
    { value: 'CRITICAL', label: t('critical') },
    { value: 'WARNING', label: t('warning') },
    { value: 'INFO', label: t('info') },
  ]

  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: DEFAULT_PAGE_SIZE, total: 0, pages: 0 })
  const [stats, setStats] = useState<Array<{ type: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null) // null = not initialized yet
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(new Set(SEVERITY_OPTIONS.map(o => o.value)))
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())
  const [rateLimits, setRateLimits] = useState<RateLimitEntry[]>([])
  const [showRateLimitsModal, setShowRateLimitsModal] = useState(false)
  const [showCleanupModal, setShowCleanupModal] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      // If filters are initialized but empty, show no results
      if ((typeFilter !== null && typeFilter.size === 0) || severityFilter.size === 0) {
        setEvents([])
        setPagination(p => ({ ...p, total: 0, pages: 0 }))
        setLoading(false)
        return
      }

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      })

      // Send comma-separated values if filtering (not showing all)
      if (typeFilter !== null && typeFilter.size > 0 && typeFilter.size < stats.length) {
        params.append('type', Array.from(typeFilter).join(','))
      }
      if (severityFilter.size > 0 && severityFilter.size < SEVERITY_OPTIONS.length) {
        params.append('severity', Array.from(severityFilter).join(','))
      }

      const response = await apiFetch(`/api/security/events?${params}`)
      if (!response.ok) throw new Error(t('failedToLoadEvents'))

      const data: SecurityEventsResponse = await response.json()
      setEvents(data.events)
      setPagination(data.pagination)
      setStats(data.stats)

      // Initialize type filter with all types on first load only
      if (typeFilter === null && data.stats.length > 0) {
        setTypeFilter(new Set(data.stats.map(s => s.type)))
      }
    } catch (error) {
      logError('Error loading security events:', error)
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.limit, typeFilter, severityFilter, stats.length, SEVERITY_OPTIONS.length, t])

  const loadRateLimits = useCallback(async () => {
    try {
      const response = await apiFetch('/api/security/rate-limits')
      if (!response.ok) throw new Error(t('failedToLoadRateLimits'))

      const data = await response.json()
      setRateLimits(data.entries || [])
    } catch (error) {
      logError('Error loading rate limits:', error)
    }
  }, [t])

  const handleUnblockRateLimit = async (key: string) => {
    if (!confirm(t('unblockConfirm'))) {
      return
    }

    try {
      const data = await apiDelete('/api/security/rate-limits', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      })

      alert(data.message)
      loadRateLimits()
    } catch (error) {
      alert(t('failedToUnblock'))
    }
  }

  const handleClearAllRateLimits = async () => {
    if (!confirm(t('clearAllConfirm'))) {
      return
    }

    try {
      const data = await apiDelete('/api/security/rate-limits', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true })
      })

      alert(data.message)
      loadRateLimits()
    } catch (error) {
      alert(t('failedToClearAll'))
    }
  }

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    if (showRateLimitsModal) {
      loadRateLimits()
    }
  }, [showRateLimitsModal, loadRateLimits])

  // Prime rate limit data so counts show immediately
  useEffect(() => {
    loadRateLimits()
  }, [loadRateLimits])

  const toggleDetails = (eventId: string) => {
    setExpandedDetails(prev => {
      const newSet = new Set(prev)
      if (newSet.has(eventId)) {
        newSet.delete(eventId)
      } else {
        newSet.add(eventId)
      }
      return newSet
    })
  }

  const handleDeleteOld = async (days: number) => {
    let confirmMessage
    if (days === 0) {
      confirmMessage = t('deleteAllConfirm')
    } else {
      confirmMessage = t('deleteOlderConfirm', { days })
    }

    if (!confirm(confirmMessage)) {
      return
    }

    setDeleting(true)
    try {
      const data = await apiDelete('/api/security/events', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ olderThan: days })
      })

      alert(data.message)
      loadEvents()
    } catch (error) {
      alert(t('failedToDeleteEvents'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Shield className="w-7 h-7 sm:w-8 sm:h-8" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {t('description')}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
          <FilterDropdown
            groups={[
              {
                key: 'type',
                label: t('eventType'),
                options: stats.map(s => ({ value: s.type, label: formatSecurityEventType(s.type) })),
                selected: typeFilter ?? new Set(),
                onChange: setTypeFilter,
              },
              {
                key: 'severity',
                label: t('severity'),
                options: SEVERITY_OPTIONS,
                selected: severityFilter,
                onChange: setSeverityFilter,
              },
            ]}
          />
          <Button
            onClick={loadEvents}
            variant="outline"
            size="sm"
            disabled={loading}
            title={tc('refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-2">{tc('refresh')}</span>
          </Button>
          <Button
            onClick={() => setShowRateLimitsModal(true)}
            variant="outline"
            size="sm"
            title={t('rateLimits')}
          >
            <Unlock className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">{t('rateLimits')}</span>
            {rateLimits.length > 0 && (
              <span className="ml-1 text-xs tabular-nums">({rateLimits.length})</span>
            )}
          </Button>
          <Button
            onClick={() => setShowCleanupModal(true)}
            variant="destructive"
            size="sm"
            title={t('deleteEvents')}
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">{tc('delete')}</span>
          </Button>
        </div>

        {/* Stats Overview */}
        <Card className="p-3 mb-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('events')}</p>
                <p className="text-base font-semibold tabular-nums">{pagination.total.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                <Tag className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('types')}</p>
                <p className="text-base font-semibold tabular-nums">{stats.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                <XCircle className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('blocked')}</p>
                <p className="text-base font-semibold tabular-nums">{events.filter(e => e.wasBlocked).length}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Events List */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <span className="text-sm font-medium">{t('title')}</span>
            <span className="text-xs text-muted-foreground">
              {t('showing', { count: events.length, total: pagination.total })}
            </span>
          </div>
          {/* Table Header */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-muted/20 border-b">
            <span className="w-20 flex-shrink-0">{t('severity')}</span>
            <span className="flex-1 min-w-0">{t('eventType')}</span>
            <span className="w-28 hidden md:block">{t('ipAddress')}</span>
            <span className="w-32 hidden lg:block">{tc('date')}</span>
            <span className="w-8 text-center">{t('block')}</span>
            <span className="w-4"></span>
          </div>
          <div>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">{t('loadingEvents')}</div>
            ) : events.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t('noEvents')}</div>
            ) : (
              <div className="divide-y">
                {events.map((event) => {
                  const isExpanded = expandedDetails.has(event.id)
                  const severityColor = event.severity === 'CRITICAL' ? 'text-destructive' :
                                       event.severity === 'WARNING' ? 'text-warning' : 'text-primary'
                  const SeverityIcon = event.severity === 'CRITICAL' ? XCircle :
                                      event.severity === 'WARNING' ? AlertTriangle : Info

                  return (
                    <div
                      key={event.id}
                      className="text-sm hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => toggleDetails(event.id)}
                    >
                      {/* Table Row */}
                      <div className="flex items-center gap-2 px-3 py-2">
                        {/* Severity */}
                        <div className="w-20 flex-shrink-0 flex items-center gap-1.5">
                          <SeverityIcon className={`w-4 h-4 flex-shrink-0 ${severityColor}`} />
                          <span className={`text-xs font-medium hidden sm:inline ${severityColor}`}>
                            {event.severity}
                          </span>
                        </div>
                        {/* Event Type */}
                        <span className="flex-1 min-w-0 font-medium truncate">
                          {formatSecurityEventType(event.type)}
                        </span>
                        {/* IP Address */}
                        <span className="w-28 text-xs text-muted-foreground truncate hidden md:block">
                          {event.ipAddress ? formatIpAddress(event.ipAddress) : '-'}
                        </span>
                        {/* Date */}
                        <span className="w-32 text-xs text-muted-foreground whitespace-nowrap hidden lg:block">
                          {formatDateTime(event.createdAt)}
                        </span>
                        {/* Blocked */}
                        <span className="w-8 flex justify-center">
                          {event.wasBlocked ? (
                            <span title={t('blocked')}>
                              <ShieldX className="w-4 h-4 text-destructive" />
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">-</span>
                          )}
                        </span>
                        {/* Chevron */}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-3 pb-3 bg-muted/20">
                          <div className="pl-6 space-y-2">
                            {/* Description */}
                            <div className="text-xs text-muted-foreground border-l-2 border-primary pl-2 py-1">
                              {getSecurityEventDescription(event.type)}
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              {event.ipAddress && (
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">{t('ip')}:</span>
                                  <span className="break-all">{formatIpAddress(event.ipAddress)}</span>
                                </div>
                              )}
                              {event.sessionId && (
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">{t('session')}:</span>
                                  <span className="break-all">{formatSessionId(event.sessionId)}</span>
                                </div>
                              )}
                              {event.project && (
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">{t('project')}:</span>
                                  <span>{event.project.title}</span>
                                </div>
                              )}
                              <div className="flex gap-2 sm:hidden">
                                <span className="text-muted-foreground">{t('time')}:</span>
                                <span>{formatDateTime(event.createdAt)}</span>
                              </div>
                              {event.referer && (
                                <div className="flex gap-2 sm:col-span-2">
                                  <span className="text-muted-foreground">{t('referer')}:</span>
                                  <span className="break-all">{event.referer}</span>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <span className="text-muted-foreground">{t('category')}:</span>
                                <span>{getSecurityEventCategory(event.type)}</span>
                              </div>
                            </div>

                            {/* Technical Details - shown inline */}
                            {event.details && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">{t('technicalDetails')}:</span>
                                <pre className="mt-1 bg-muted/50 p-2 rounded border overflow-auto max-h-32">
                                  {JSON.stringify(event.details, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {(pagination.pages > 1 || pagination.total > DEFAULT_PAGE_SIZE) && (
              <div className="flex items-center justify-between px-3 py-2 border-t">
                <Button
                  onClick={(e) => { e.stopPropagation(); setPagination(p => ({ ...p, page: p.page - 1 })) }}
                  disabled={pagination.page === 1 || loading}
                  variant="outline"
                  size="sm"
                >
                  {tc('previous')}
                </Button>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {tc('pageOf', { page: pagination.page, pages: pagination.pages })}
                  </span>
                  <select
                    value={pagination.limit}
                    onChange={(e) => setPagination(p => ({ ...p, limit: Number(e.target.value), page: 1 }))}
                    className="text-xs border rounded px-1.5 py-1 bg-background text-foreground"
                  >
                    {PAGE_SIZE_OPTIONS.map(size => (
                      <option key={size} value={size}>{size} {t('perPage')}</option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={(e) => { e.stopPropagation(); setPagination(p => ({ ...p, page: p.page + 1 })) }}
                  disabled={pagination.page === pagination.pages || loading}
                  variant="outline"
                  size="sm"
                >
                  {tc('next')}
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Cleanup Modal */}
      <Dialog open={showCleanupModal} onOpenChange={setShowCleanupModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              {t('deleteEvents')}
            </DialogTitle>
            <DialogDescription>
              {t('deleteEventsDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Button
              onClick={() => { handleDeleteOld(7); setShowCleanupModal(false) }}
              variant="outline"
              className="justify-start"
              disabled={deleting}
            >
              {t('deleteOlderThan7')}
            </Button>
            <Button
              onClick={() => { handleDeleteOld(30); setShowCleanupModal(false) }}
              variant="outline"
              className="justify-start"
              disabled={deleting}
            >
              {t('deleteOlderThan30')}
            </Button>
            <Button
              onClick={() => { handleDeleteOld(90); setShowCleanupModal(false) }}
              variant="outline"
              className="justify-start"
              disabled={deleting}
            >
              {t('deleteOlderThan90')}
            </Button>
            <Button
              onClick={() => { handleDeleteOld(0); setShowCleanupModal(false) }}
              variant="destructive"
              className="justify-start"
              disabled={deleting}
            >
              {t('deleteAllEvents')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rate Limits Modal */}
      <Dialog open={showRateLimitsModal} onOpenChange={setShowRateLimitsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="w-5 h-5 text-primary" />
              {t('activeRateLimits')}
            </DialogTitle>
            <DialogDescription>
              {t('rateLimitsDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {rateLimits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('noRateLimits')}
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {rateLimits.map((entry) => (
                  <div key={entry.key} className="border rounded-lg p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{tc('type')}: {entry.type}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('failedAttempts', { count: entry.count })}
                        </div>
                        <div className="text-xs text-muted-foreground break-words">
                          {t('lockedUntil', { date: new Date(entry.lockoutUntil).toLocaleString() })}
                        </div>
                      </div>
                      {entry.lockoutUntil > Date.now() ? (
                        <Button
                          onClick={() => handleUnblockRateLimit(entry.key)}
                          variant="outline"
                          size="sm"
                        >
                          <Unlock className="w-4 h-4 mr-2" />
                          {t('unblock')}
                        </Button>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {t('lockExpired')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {rateLimits.length > 0 && (
              <Button variant="destructive" size="sm" onClick={handleClearAllRateLimits} className="sm:mr-auto">
                {t('clearAllRateLimits')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowRateLimitsModal(false)}>
              {tc('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
