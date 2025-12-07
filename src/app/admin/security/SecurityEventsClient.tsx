'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, AlertTriangle, Info, XCircle, Trash2, RefreshCw, ChevronRight, Unlock, Tag, Ban, Plus } from 'lucide-react'
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

interface BlockedIP {
  id: string
  ipAddress: string
  reason: string | null
  createdAt: string
}

interface BlockedDomain {
  id: string
  domain: string
  reason: string | null
  createdAt: string
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
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([])
  const [blockedDomains, setBlockedDomains] = useState<BlockedDomain[]>([])
  const [showBlocklists, setShowBlocklists] = useState(false)
  const [newIP, setNewIP] = useState('')
  const [newIPReason, setNewIPReason] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newDomainReason, setNewDomainReason] = useState('')

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

  const loadBlocklists = async () => {
    try {
      const [ipsResponse, domainsResponse] = await Promise.all([
        apiFetch('/api/security/blocklist/ips'),
        apiFetch('/api/security/blocklist/domains')
      ])

      if (ipsResponse.ok) {
        const ipsData = await ipsResponse.json()
        setBlockedIPs(ipsData.blockedIPs || [])
      }

      if (domainsResponse.ok) {
        const domainsData = await domainsResponse.json()
        setBlockedDomains(domainsData.blockedDomains || [])
      }
    } catch (error) {
      console.error('Error loading blocklists:', error)
    }
  }

  const handleAddIP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIP.trim()) return

    try {
      const response = await apiFetch('/api/security/blocklist/ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipAddress: newIP.trim(), reason: newIPReason.trim() || null })
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to block IP')
        return
      }

      setNewIP('')
      setNewIPReason('')
      loadBlocklists()
    } catch (error) {
      alert('Failed to block IP address')
    }
  }

  const handleRemoveIP = async (id: string) => {
    if (!confirm('Remove this IP from blocklist?')) return

    try {
      await apiDelete('/api/security/blocklist/ips', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })

      loadBlocklists()
    } catch (error) {
      alert('Failed to remove IP from blocklist')
    }
  }

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDomain.trim()) return

    try {
      const response = await apiFetch('/api/security/blocklist/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain.trim(), reason: newDomainReason.trim() || null })
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to block domain')
        return
      }

      setNewDomain('')
      setNewDomainReason('')
      loadBlocklists()
    } catch (error) {
      alert('Failed to block domain')
    }
  }

  const handleRemoveDomain = async (id: string) => {
    if (!confirm('Remove this domain from blocklist?')) return

    try {
      await apiDelete('/api/security/blocklist/domains', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })

      loadBlocklists()
    } catch (error) {
      alert('Failed to remove domain from blocklist')
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

  useEffect(() => {
    if (showBlocklists) {
      loadBlocklists()
    }
  }, [showBlocklists])

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
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Security Events
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
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
                      {formatSecurityEventType(stat.type)} ({stat.count})
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

              <div className="flex flex-wrap items-stretch sm:items-end gap-2 w-full sm:w-auto">
                <Button
                  onClick={loadEvents}
                  variant="outline"
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  onClick={() => setShowRateLimits(!showRateLimits)}
                  variant={showRateLimits ? 'default' : 'outline'}
                  className="w-full sm:w-auto"
                >
                  <Unlock className="w-4 h-4 mr-2" />
                  Rate Limits ({rateLimits.length})
                </Button>
                <Button
                  onClick={() => setShowBlocklists(!showBlocklists)}
                  variant={showBlocklists ? 'default' : 'outline'}
                  className="w-full sm:w-auto"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Blocklists ({blockedIPs.length + blockedDomains.length})
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => handleDeleteOld(7)}
                variant="outline"
                size="sm"
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete events older than 7 days
              </Button>
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
              <Button
                onClick={() => handleDeleteOld(0)}
                variant="destructive"
                size="sm"
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete all events
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
                    <div key={entry.key} className="border rounded-lg p-3 sm:p-4">
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
                        <Button
                          onClick={() => handleUnblockRateLimit(entry.key)}
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                        >
                          <Unlock className="w-4 h-4 mr-2" />
                          Unblock
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Blocklists Panel */}
        {showBlocklists && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>IP & Domain Blocklists</CardTitle>
              <CardDescription>
                Manage blocked IP addresses and domains
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Blocked IPs Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Blocked IP Addresses</h3>
                <form onSubmit={handleAddIP} className="flex flex-col sm:flex-row gap-2 mb-4">
                  <input
                    type="text"
                    value={newIP}
                    onChange={(e) => setNewIP(e.target.value)}
                    placeholder="IP Address (e.g., 192.168.1.1)"
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  />
                  <input
                    type="text"
                    value={newIPReason}
                    onChange={(e) => setNewIPReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  />
                  <Button type="submit" className="sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </form>
                {blockedIPs.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">No blocked IPs</div>
                ) : (
                  <div className="space-y-2">
                    {blockedIPs.map((ip) => (
                      <div key={ip.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono font-medium break-all">{ip.ipAddress}</div>
                          {ip.reason && <div className="text-sm text-muted-foreground mt-1 break-words">{ip.reason}</div>}
                          <div className="text-xs text-muted-foreground mt-1">
                            Added {formatDateTime(ip.createdAt)}
                          </div>
                        </div>
                        <Button
                          onClick={() => handleRemoveIP(ip.id)}
                          variant="outline"
                          size="sm"
                          className="flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Blocked Domains Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Blocked Domains</h3>
                <form onSubmit={handleAddDomain} className="flex flex-col sm:flex-row gap-2 mb-4">
                  <input
                    type="text"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="Domain (e.g., example.com)"
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  />
                  <input
                    type="text"
                    value={newDomainReason}
                    onChange={(e) => setNewDomainReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground"
                  />
                  <Button type="submit" className="sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </form>
                {blockedDomains.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">No blocked domains</div>
                ) : (
                  <div className="space-y-2">
                    {blockedDomains.map((domain) => (
                      <div key={domain.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono font-medium break-all">{domain.domain}</div>
                          {domain.reason && <div className="text-sm text-muted-foreground mt-1 break-words">{domain.reason}</div>}
                          <div className="text-xs text-muted-foreground mt-1">
                            Added {formatDateTime(domain.createdAt)}
                          </div>
                        </div>
                        <Button
                          onClick={() => handleRemoveDomain(domain.id)}
                          variant="outline"
                          size="sm"
                          className="flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                  <div key={event.id} className="border rounded-lg p-3 sm:p-4">
                    <div className="space-y-3">
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
                      <div className="text-sm text-foreground bg-muted/50 rounded p-2 border-l-2 border-primary">
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
