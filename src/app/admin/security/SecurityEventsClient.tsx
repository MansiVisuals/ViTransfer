'use client'

import { useState, useEffect } from 'react'
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

interface RateLimitEntry {
  key: string
  lockoutUntil: number
  count: number
  type: string
}

// Calculate page size to fill available height without scrolling
function calculatePageSize(rowHeight: number, headerOffset: number): number {
  if (typeof window === 'undefined') return 15
  const available = window.innerHeight - headerOffset
  return Math.max(5, Math.floor(available / rowHeight))
}

function useResponsivePageSize(rowHeight: number, headerOffset: number): number {
  // Calculate initial value synchronously to prevent flickering on mount
  const [pageSize, setPageSize] = useState(() => calculatePageSize(rowHeight, headerOffset))

  useEffect(() => {
    // Only listen for resize events, don't recalculate on mount
    const handleResize = () => setPageSize(calculatePageSize(rowHeight, headerOffset))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [rowHeight, headerOffset])

  return pageSize
}

export default function SecurityEventsClient() {
  const SEVERITY_OPTIONS = [
    { value: 'CRITICAL', label: 'Critical' },
    { value: 'WARNING', label: 'Warning' },
    { value: 'INFO', label: 'Info' },
  ]

  // Row ~40px, header/stats/filters ~280px offset
  const dynamicLimit = useResponsivePageSize(40, 280)
  const [events, setEvents] = useState<SecurityEvent[]>([])
  // Initialize pagination with dynamic limit to prevent re-fetch on mount
  const [pagination, setPagination] = useState(() => ({ page: 1, limit: calculatePageSize(40, 280), total: 0, pages: 0 }))
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

  // Update pagination limit when screen size changes
  useEffect(() => {
    setPagination(p => ({ ...p, limit: dynamicLimit, page: 1 }))
  }, [dynamicLimit])

  useEffect(() => {
    loadEvents()
  }, [pagination.page, pagination.limit, typeFilter, severityFilter])

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
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <span className="text-sm font-medium">Security Events</span>
            <span className="text-xs text-muted-foreground">
              Showing {events.length} of {pagination.total}
            </span>
          </div>
          {/* Table Header */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-muted/20 border-b">
            <span className="w-20 flex-shrink-0">Severity</span>
            <span className="flex-1 min-w-0">Event Type</span>
            <span className="w-28 hidden md:block">IP Address</span>
            <span className="w-32 hidden lg:block">Date</span>
            <span className="w-8 text-center">Block</span>
            <span className="w-4"></span>
          </div>
          <div>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No security events found</div>
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
                            <span title="Blocked">
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
                                  <span className="text-muted-foreground">IP:</span>
                                  <span className="break-all">{formatIpAddress(event.ipAddress)}</span>
                                </div>
                              )}
                              {event.sessionId && (
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">Session:</span>
                                  <span className="break-all">{formatSessionId(event.sessionId)}</span>
                                </div>
                              )}
                              {event.project && (
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">Project:</span>
                                  <span>{event.project.title}</span>
                                </div>
                              )}
                              <div className="flex gap-2 sm:hidden">
                                <span className="text-muted-foreground">Time:</span>
                                <span>{formatDateTime(event.createdAt)}</span>
                              </div>
                              {event.referer && (
                                <div className="flex gap-2 sm:col-span-2">
                                  <span className="text-muted-foreground">Referer:</span>
                                  <span className="break-all">{event.referer}</span>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <span className="text-muted-foreground">Category:</span>
                                <span>{getSecurityEventCategory(event.type)}</span>
                              </div>
                            </div>

                            {/* Technical Details - shown inline */}
                            {event.details && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">Technical Details:</span>
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
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t">
                <Button
                  onClick={(e) => { e.stopPropagation(); setPagination(p => ({ ...p, page: p.page - 1 })) }}
                  disabled={pagination.page === 1 || loading}
                  variant="outline"
                  size="sm"
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <Button
                  onClick={(e) => { e.stopPropagation(); setPagination(p => ({ ...p, page: p.page + 1 })) }}
                  disabled={pagination.page === pagination.pages || loading}
                  variant="outline"
                  size="sm"
                >
                  Next
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
