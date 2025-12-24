'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, AlertTriangle, Info, XCircle, Trash2, RefreshCw, ChevronRight, Unlock, Tag } from 'lucide-react'
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
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 })
  const [stats, setStats] = useState<Array<{ type: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [filterType, setFilterType] = useState<string>('')
  const [filterSeverity, setFilterSeverity] = useState<string>('')
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())
  const [rateLimits, setRateLimits] = useState<RateLimitEntry[]>([])
  const [showRateLimits, setShowRateLimits] = useState(false)
  const [cleanupDays, setCleanupDays] = useState<0 | 7 | 30 | 90>(90)

  const loadEvents = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      })

      if (filterType) params.append('type', filterType)
      if (filterSeverity) params.append('severity', filterSeverity)

      const response = await apiFetch(`/api/security/events?${params}`)
      if (!response.ok) throw new Error('Failed to load security events')

      const data: SecurityEventsResponse = await response.json()
      setEvents(data.events)
      setPagination(data.pagination)
      setStats(data.stats)
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
  }, [pagination.page, filterType, filterSeverity])

  useEffect(() => {
    if (showRateLimits) {
      loadRateLimits()
    }
  }, [showRateLimits])

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
        <div className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Security Events
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Monitor security events, hotlink attempts, rate limits, and suspicious activity
          </p>
        </div>

        {/* Stats Overview */}
        <Card className="mb-4">
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardTitle className="text-sm font-medium">Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Events</p>
                  <p className="text-base font-semibold tabular-nums truncate">{pagination.total.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                  <Tag className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Types</p>
                  <p className="text-base font-semibold tabular-nums truncate">{stats.length}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 min-w-0 col-span-2 sm:col-span-1">
                <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                  <XCircle className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Blocked</p>
                  <p className="text-base font-semibold tabular-nums truncate">{events.filter(e => e.wasBlocked).length}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters and Actions */}
        <Card className="mb-4">
          <CardContent className="p-3 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-xs font-medium text-muted-foreground block">Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full mt-1 h-9 px-3 bg-background text-foreground border border-border rounded-md"
                >
                  <option value="">All Types</option>
                  {stats.map(stat => (
                    <option key={stat.type} value={stat.type}>
                      {formatSecurityEventType(stat.type)} ({stat.count})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground block">Severity</label>
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="w-full mt-1 h-9 px-3 bg-background text-foreground border border-border rounded-md"
                >
                  <option value="">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                  <option value="INFO">Info</option>
                </select>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  onClick={loadEvents}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline ml-2">Refresh</span>
                </Button>
                <Button
                  onClick={() => setShowRateLimits(!showRateLimits)}
                  variant={showRateLimits ? 'default' : 'outline'}
                  size="sm"
                >
                  <Unlock className="w-4 h-4" />
                  <span className="hidden sm:inline ml-2">Rate Limits</span>
                  <span className="ml-2 text-xs tabular-nums">({rateLimits.length})</span>
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground block">Cleanup</label>
                <select
                  value={cleanupDays}
                  onChange={(e) => setCleanupDays(Number(e.target.value) as 0 | 7 | 30 | 90)}
                  className="w-full mt-1 h-9 px-3 bg-background text-foreground border border-border rounded-md"
                >
                  <option value={7}>Delete older than 7 days</option>
                  <option value={30}>Delete older than 30 days</option>
                  <option value={90}>Delete older than 90 days</option>
                  <option value={0}>Delete all events</option>
                </select>
              </div>

              <Button
                onClick={() => handleDeleteOld(cleanupDays)}
                variant={cleanupDays === 0 ? 'destructive' : 'outline'}
                size="sm"
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline ml-2">Run Cleanup</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Rate Limits Panel */}
        {showRateLimits && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Active Rate Limits</CardTitle>
              <CardDescription>
                Currently locked out IPs and accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rateLimits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No active rate limits</div>
              ) : (
                <div className="space-y-2">
                  {rateLimits.map((entry) => (
                    <div key={entry.key} className="border rounded-lg p-2 sm:p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1">
                          <div className="font-medium">Type: {entry.type}</div>
                          <div className="text-sm text-muted-foreground">
                            Failed attempts: {entry.count}
                          </div>
                          <div className="text-sm text-muted-foreground break-words">
                            Locked until: {new Date(entry.lockoutUntil).toLocaleString()}
                          </div>
                        </div>
                        {entry.lockoutUntil > Date.now() ? (
                          <Button
                            onClick={() => handleUnblockRateLimit(entry.key)}
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                          >
                            <Unlock className="w-4 h-4 mr-2" />
                            Unblock
                          </Button>
                        ) : (
                          <div className="text-xs text-muted-foreground text-right">
                            Lock expired
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
    </div>
  )
}
