'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, AlertTriangle, Info, XCircle, Trash2, RefreshCw } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'

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

function formatEventType(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

export default function SecurityEventsClient() {
  const [events, setEvents] = useState<SecurityEvent[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 })
  const [stats, setStats] = useState<Array<{ type: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [filterType, setFilterType] = useState<string>('')
  const [filterSeverity, setFilterSeverity] = useState<string>('')

  const loadEvents = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      })

      if (filterType) params.append('type', filterType)
      if (filterSeverity) params.append('severity', filterSeverity)

      const response = await fetch(`/api/security/events?${params}`)
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

  useEffect(() => {
    loadEvents()
  }, [pagination.page, filterType, filterSeverity])

  const handleDeleteOld = async (days: number) => {
    if (!confirm(`Delete all security events older than ${days} days? This cannot be undone.`)) {
      return
    }

    setDeleting(true)
    try {
      const response = await fetch('/api/security/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ olderThan: days })
      })

      if (!response.ok) throw new Error('Failed to delete events')

      const data = await response.json()
      alert(data.message)
      loadEvents()
    } catch (error) {
      alert('Failed to delete events')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Security Events
          </h1>
          <p className="text-muted-foreground mt-2">
            Monitor security events, hotlink attempts, rate limits, and suspicious activity
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pagination.total.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Event Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Blocked Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {events.filter(e => e.wasBlocked).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters & Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium mb-2 block">Event Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-2 bg-background text-foreground border border-border rounded-md"
                >
                  <option value="">All Types</option>
                  {stats.map(stat => (
                    <option key={stat.type} value={stat.type}>
                      {formatEventType(stat.type)} ({stat.count})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium mb-2 block">Severity</label>
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="w-full px-3 py-2 bg-background text-foreground border border-border rounded-md"
                >
                  <option value="">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                  <option value="INFO">Info</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <Button onClick={loadEvents} variant="outline" disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => handleDeleteOld(30)}
                variant="outline"
                size="sm"
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete events older than 30 days
              </Button>
              <Button
                onClick={() => handleDeleteOld(90)}
                variant="outline"
                size="sm"
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete events older than 90 days
              </Button>
            </div>
          </CardContent>
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
                  <div key={event.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getSeverityColor(event.severity)}`}>
                            {getSeverityIcon(event.severity)}
                            {event.severity}
                          </span>
                          <span className="text-sm font-medium">{formatEventType(event.type)}</span>
                          {event.wasBlocked && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-destructive-visible text-destructive border border-destructive-visible">
                              BLOCKED
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-muted-foreground space-y-1">
                          {event.ipAddress && <div>IP: {event.ipAddress}</div>}
                          {event.sessionId && <div>Session: {event.sessionId.substring(0, 16)}...</div>}
                          {event.project && <div>Project: {event.project.title}</div>}
                          {event.referer && <div>Referer: {event.referer}</div>}
                          {event.details && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs font-medium">View Details</summary>
                              <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
                                {JSON.stringify(event.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
                        {formatDateTime(event.createdAt)}
                      </div>
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
