'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Shield, AlertTriangle, Info, XCircle, Trash2, RefreshCw, ChevronRight, Unlock, Tag } from 'lucide-react'
import FilterDropdown from '@/components/FilterDropdown'
import { formatDateTime } from '@/lib/utils'
import { apiDelete, apiFetch } from '@/lib/api-client'
import {
  formatSecurityEventType,
  getSecurityEventDescription,
  getSecurityEventCategory,
  formatIpAddress,
  formatSessionId,
  type SecurityEventType
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

function getSeverityColor(severity: string): string {
  const map: Record<string, string> = {
    'CRITICAL': 'bg-destructive-visible text-destructive border-2 border-destructive-visible',
    'WARNING': 'bg-warning-visible text-warning border-2 border-warning-visible',
    'INFO': 'bg-primary-visible text-primary border-2 border-primary-visible',
  }
  return map[severity] || 'bg-muted text-muted-foreground border border-border'
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return <XCircle className="w-4 h-4" />
    case 'WARNING':
      return <AlertTriangle className="w-4 h-4" />
    case 'INFO':
      return <Info className="w-4 h-4" />
    default:
      return <Shield className="w-4 h-4" />
  }
}

interface RateLimitEntry {
  key: string
  lockoutUntil: number
  count: number
  type: string
}

export default function SecurityEventsClient() {
  const SEVERITY_OPTIONS = [
    { value: 'CRITICAL', label: 'Critical' },
    { value: 'WARNING', label: 'Warning' },
    { value: 'INFO', label: 'Info' },
  ]

  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [stats, setStats] = useState<Array<{ type: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null) // null = not initialized yet
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(new Set(SEVERITY_OPTIONS.map(o => o.value)))
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())
  const [rateLimits, setRateLimits] = useState<RateLimitEntry[]>([])
  const [showRateLimitsModal, setShowRateLimitsModal] = useState(false)
  const [showCleanupModal, setShowCleanupModal] = useState(false)

  const loadEvents = async () => {
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
      if (!response.ok) throw new Error('Failed to load security events')

      const data: SecurityEventsResponse = await response.json()
      setEvents(data.events)
      setPagination(data.pagination)
      setStats(data.stats)

      // Initialize type filter with all types on first load only
      if (typeFilter === null && data.stats.length > 0) {
        setTypeFilter(new Set(data.stats.map(s => s.type)))
      }
    } catch (error) {
      console.error('Error loading security events:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadRateLimits = async () => {
    try {
      const response = await apiFetch('/api/security/rate-limits')
      if (!response.ok) throw new Error('Failed to load rate limits')

      const data = await response.json()
      setRateLimits(data.entries || [])
    } catch (error) {
      console.error('Error loading rate limits:', error)
    }
  }

  const handleUnblockRateLimit = async (key: string) => {
    if (!confirm('Unblock this rate limit entry? The user/IP will be able to attempt login again.')) {
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
      alert('Failed to unblock rate limit')
    }
  }

  useEffect(() => {
    loadEvents()
  }, [pagination.page, typeFilter, severityFilter])

  useEffect(() => {
    if (showRateLimitsModal) {
      loadRateLimits()
    }
  }, [showRateLimitsModal])

  // Prime rate limit data so counts show immediately
  useEffect(() => {
    loadRateLimits()
  }, [])

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
      confirmMessage = 'Delete ALL security events? This will permanently delete every security event in the system and CANNOT be undone.'
    } else {
      confirmMessage = `Delete all security events older than ${days} days? This cannot be undone.`
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
      alert('Failed to delete events')
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
            Security Events
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Monitor events, rate limits, and suspicious activity
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
          <FilterDropdown
            groups={[
              {
                key: 'type',
                label: 'Event Type',
                options: stats.map(s => ({ value: s.type, label: formatSecurityEventType(s.type) })),
                selected: typeFilter ?? new Set(),
                onChange: setTypeFilter,
              },
              {
                key: 'severity',
                label: 'Severity',
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
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-2">Refresh</span>
          </Button>
          <Button
            onClick={() => setShowRateLimitsModal(true)}
            variant="outline"
            size="sm"
            title="Rate Limits"
          >
            <Unlock className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">Rate Limits</span>
            {rateLimits.length > 0 && (
              <span className="ml-1 text-xs tabular-nums">({rateLimits.length})</span>
            )}
          </Button>
          <Button
            onClick={() => setShowCleanupModal(true)}
            variant="destructive"
            size="sm"
            title="Delete Events"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">Delete</span>
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
                <p className="text-xs text-muted-foreground">Events</p>
                <p className="text-base font-semibold tabular-nums">{pagination.total.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                <Tag className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Types</p>
                <p className="text-base font-semibold tabular-nums">{stats.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                <XCircle className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Blocked</p>
                <p className="text-base font-semibold tabular-nums">{events.filter(e => e.wasBlocked).length}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Events List */}
        <Card>
          <CardHeader>
            <CardTitle>Security Events</CardTitle>
            <CardDescription>
              Showing {events.length} of {pagination.total} events
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No security events found</div>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <div key={event.id} className="border rounded-lg p-2 sm:p-3">
                    <div className="space-y-2">
                      {/* Header Row - Mobile Optimized */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getSeverityColor(event.severity)}`}>
                              {getSeverityIcon(event.severity)}
                              <span className="hidden sm:inline">{event.severity}</span>
                            </span>
                            {event.wasBlocked && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-destructive-visible text-destructive border border-destructive-visible">
                                BLOCKED
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground bg-muted">
                              <Tag className="w-3 h-3" />
                              {getSecurityEventCategory(event.type)}
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-foreground">
                            {formatSecurityEventType(event.type)}
                          </h3>
                        </div>
                        <div className="text-xs text-muted-foreground text-right whitespace-nowrap shrink-0">
                          {formatDateTime(event.createdAt)}
                        </div>
                      </div>

                      {/* Description */}
                      <div className="text-sm text-foreground bg-muted/50 rounded border-l-2 border-primary p-2">
                        {getSecurityEventDescription(event.type)}
                      </div>

                      {/* Event Details */}
                      {(event.ipAddress || event.sessionId || event.project || event.referer) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          {event.ipAddress && (
                            <div className="break-all">
                              <span className="font-medium text-foreground">IP Address:</span>
                              <div className="text-muted-foreground">{formatIpAddress(event.ipAddress)}</div>
                            </div>
                          )}
                          {event.sessionId && (
                            <div className="break-all">
                              <span className="font-medium text-foreground">Session:</span>
                              <div className="text-muted-foreground">{formatSessionId(event.sessionId)}</div>
                            </div>
                          )}
                          {event.project && (
                            <div className="break-words">
                              <span className="font-medium text-foreground">Project:</span>
                              <div className="text-muted-foreground">{event.project.title}</div>
                            </div>
                          )}
                          {event.referer && (
                            <div className="break-all sm:col-span-2">
                              <span className="font-medium text-foreground">Referer:</span>
                              <div className="text-muted-foreground">{event.referer}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Technical Details Toggle */}
                      {event.details && (
                        <div>
                          <button
                            onClick={() => toggleDetails(event.id)}
                            className="text-xs font-medium flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronRight className={`w-3 h-3 transition-transform ${expandedDetails.has(event.id) ? 'rotate-90' : ''}`} />
                            {expandedDetails.has(event.id) ? 'Hide' : 'Show'} Technical Details
                          </button>
                          {expandedDetails.has(event.id) && (
                            <pre className="mt-2 text-xs bg-muted/50 p-3 rounded border overflow-auto max-h-48">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <Button
                  onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page === 1 || loading}
                  variant="outline"
                  size="sm"
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <Button
                  onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page === pagination.pages || loading}
                  variant="outline"
                  size="sm"
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cleanup Modal */}
      <Dialog open={showCleanupModal} onOpenChange={setShowCleanupModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Delete Security Events
            </DialogTitle>
            <DialogDescription>
              Remove old security events from the database. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Button
              onClick={() => { handleDeleteOld(7); setShowCleanupModal(false) }}
              variant="outline"
              className="justify-start"
              disabled={deleting}
            >
              Delete events older than 7 days
            </Button>
            <Button
              onClick={() => { handleDeleteOld(30); setShowCleanupModal(false) }}
              variant="outline"
              className="justify-start"
              disabled={deleting}
            >
              Delete events older than 30 days
            </Button>
            <Button
              onClick={() => { handleDeleteOld(90); setShowCleanupModal(false) }}
              variant="outline"
              className="justify-start"
              disabled={deleting}
            >
              Delete events older than 90 days
            </Button>
            <Button
              onClick={() => { handleDeleteOld(0); setShowCleanupModal(false) }}
              variant="destructive"
              className="justify-start"
              disabled={deleting}
            >
              Delete all events
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rate Limits Modal */}
      <Dialog open={showRateLimitsModal} onOpenChange={setShowRateLimitsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="w-5 h-5" />
              Active Rate Limits
            </DialogTitle>
            <DialogDescription>
              Currently locked out IPs and accounts due to excessive failed attempts.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {rateLimits.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No active rate limits
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {rateLimits.map((entry) => (
                  <div key={entry.key} className="border rounded-lg p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">Type: {entry.type}</div>
                        <div className="text-xs text-muted-foreground">
                          Failed attempts: {entry.count}
                        </div>
                        <div className="text-xs text-muted-foreground break-words">
                          Locked until: {new Date(entry.lockoutUntil).toLocaleString()}
                        </div>
                      </div>
                      {entry.lockoutUntil > Date.now() ? (
                        <Button
                          onClick={() => handleUnblockRateLimit(entry.key)}
                          variant="outline"
                          size="sm"
                        >
                          <Unlock className="w-4 h-4 mr-2" />
                          Unblock
                        </Button>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Lock expired
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRateLimitsModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
