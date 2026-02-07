import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { Clock, AlertTriangle, CheckCircle } from 'lucide-react'

function formatDurationSetting(value: string, unit: string, fallbackValue = 15): string {
  const parsedValue = Number.parseInt(value, 10)
  const normalizedValue = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue
  const unitPlural = unit.toLowerCase()
  const unitSingular = unitPlural.endsWith('s') ? unitPlural.slice(0, -1) : unitPlural
  const unitLabel = normalizedValue === 1 ? unitSingular : unitPlural
  return `${normalizedValue} ${unitLabel}`
}

interface SecuritySettingsSectionProps {
  showSecuritySettings: boolean
  setShowSecuritySettings: (value: boolean) => void
  httpsEnabled: boolean
  setHttpsEnabled: (value: boolean) => void
  hotlinkProtection: string
  setHotlinkProtection: (value: string) => void
  ipRateLimit: string
  setIpRateLimit: (value: string) => void
  sessionRateLimit: string
  setSessionRateLimit: (value: string) => void
  shareSessionRateLimit: string
  setShareSessionRateLimit: (value: string) => void
  shareTokenTtlSeconds: string
  setShareTokenTtlSeconds: (value: string) => void
  passwordAttempts: string
  setPasswordAttempts: (value: string) => void
  maxUploadSizeGB: string
  setMaxUploadSizeGB: (value: string) => void
  sessionTimeoutValue: string
  setSessionTimeoutValue: (value: string) => void
  sessionTimeoutUnit: string
  setSessionTimeoutUnit: (value: string) => void
  adminSessionTimeoutValue: string
  setAdminSessionTimeoutValue: (value: string) => void
  adminSessionTimeoutUnit: string
  setAdminSessionTimeoutUnit: (value: string) => void
  trackAnalytics: boolean
  setTrackAnalytics: (value: boolean) => void
  trackSecurityLogs: boolean
  setTrackSecurityLogs: (value: boolean) => void
  viewSecurityEvents: boolean
  setViewSecurityEvents: (value: boolean) => void
  blockedIPs: Array<{ id: string; ipAddress: string; reason: string | null; createdAt: string }>
  blockedDomains: Array<{ id: string; domain: string; reason: string | null; createdAt: string }>
  newIP: string
  setNewIP: (value: string) => void
  newIPReason: string
  setNewIPReason: (value: string) => void
  newDomain: string
  setNewDomain: (value: string) => void
  newDomainReason: string
  setNewDomainReason: (value: string) => void
  onAddIP: (e: React.FormEvent) => void
  onRemoveIP: (id: string) => void
  onAddDomain: (e: React.FormEvent) => void
  onRemoveDomain: (id: string) => void
  blocklistsLoading: boolean
}

export function SecuritySettingsSection({
  showSecuritySettings,
  setShowSecuritySettings,
  httpsEnabled,
  setHttpsEnabled,
  hotlinkProtection,
  setHotlinkProtection,
  ipRateLimit,
  setIpRateLimit,
  sessionRateLimit,
  setSessionRateLimit,
  shareSessionRateLimit,
  setShareSessionRateLimit,
  shareTokenTtlSeconds,
  setShareTokenTtlSeconds,
  passwordAttempts,
  setPasswordAttempts,
  maxUploadSizeGB,
  setMaxUploadSizeGB,
  sessionTimeoutValue,
  setSessionTimeoutValue,
  sessionTimeoutUnit,
  setSessionTimeoutUnit,
  adminSessionTimeoutValue,
  setAdminSessionTimeoutValue,
  adminSessionTimeoutUnit,
  setAdminSessionTimeoutUnit,
  trackAnalytics,
  setTrackAnalytics,
  trackSecurityLogs,
  setTrackSecurityLogs,
  viewSecurityEvents,
  setViewSecurityEvents,
  blockedIPs,
  blockedDomains,
  newIP,
  setNewIP,
  newIPReason,
  setNewIPReason,
  newDomain,
  setNewDomain,
  newDomainReason,
  setNewDomainReason,
  onAddIP,
  onRemoveIP,
  onAddDomain,
  onRemoveDomain,
  blocklistsLoading,
}: SecuritySettingsSectionProps) {
  return (
    <CollapsibleSection
      className="border-border"
      title="Advanced Security Settings"
      description="Configure advanced security options"
      open={showSecuritySettings}
      onOpenChange={setShowSecuritySettings}
      contentClassName="space-y-4 border-t pt-4"
    >
          <div className="p-3 bg-warning-visible border-2 border-warning-visible rounded-md">
            <p className="text-sm font-semibold text-warning">
              Warning: Advanced Configuration
            </p>
            <p className="text-xs text-warning font-medium mt-1">
              These settings control critical security features including rate limiting, hotlink protection, and access controls. Modifying these values without proper understanding may impact system functionality and security. Only adjust if you are familiar with these security mechanisms.
            </p>
          </div>

          {/* HTTPS Enforcement */}
          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="httpsEnabled">HTTPS Enforcement</Label>
                <p className="text-xs text-muted-foreground">
                  Enable for production deployments. Disable for local development with HTTP.
                </p>
              </div>
              <Switch
                id="httpsEnabled"
                checked={httpsEnabled}
                onCheckedChange={setHttpsEnabled}
              />
            </div>

            {httpsEnabled && (
              <div className="p-3 bg-primary-visible border-2 border-primary-visible rounded-md">
                <p className="text-xs text-primary">
                  HSTS header is enabled, forcing browsers to use HTTPS connections.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <Label>Hotlink Protection</Label>
            <Select value={hotlinkProtection} onValueChange={setHotlinkProtection}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DISABLED">Disabled - No hotlink protection</SelectItem>
                <SelectItem value="LOG_ONLY">Log Only - Detect but allow</SelectItem>
                <SelectItem value="BLOCK_STRICT">Block Strict - Block suspected hotlinks</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Controls how the system handles hotlinking attempts. Log Only is recommended for monitoring.
            </p>
            <div className="mt-4 space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Hotlink Blocklists</h4>
                {blocklistsLoading && <span className="text-xs text-muted-foreground">Refreshing...</span>}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Blocked IP Addresses</p>
                  <form
                    onSubmit={onAddIP}
                    className="flex flex-col gap-2"
                  >
                    <input
                      type="text"
                      value={newIP}
                      onChange={(e) => setNewIP(e.target.value)}
                      placeholder="IP Address (e.g., 192.168.1.1)"
                      className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                    />
                    <input
                      type="text"
                      value={newIPReason}
                      onChange={(e) => setNewIPReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md w-full sm:w-auto"
                    >
                      Add
                    </button>
                  </form>
                  {blockedIPs.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No blocked IPs</div>
                  ) : (
                    <div className="space-y-2">
                      {blockedIPs.map(ip => (
                        <div key={ip.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm break-all">{ip.ipAddress}</div>
                            {ip.reason && <div className="text-xs text-muted-foreground mt-1 break-words">{ip.reason}</div>}
                            <div className="text-[11px] text-muted-foreground mt-1">
                              Added {new Date(ip.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveIP(ip.id)}
                            className="text-sm text-destructive border border-destructive px-2 py-1 rounded-md hover:bg-destructive/10"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Blocked Domains</p>
                  <form
                    onSubmit={onAddDomain}
                    className="flex flex-col gap-2"
                  >
                    <input
                      type="text"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="Domain (e.g., example.com)"
                      className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                    />
                    <input
                      type="text"
                      value={newDomainReason}
                      onChange={(e) => setNewDomainReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md w-full sm:w-auto"
                    >
                      Add
                    </button>
                  </form>
                  {blockedDomains.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No blocked domains</div>
                  ) : (
                    <div className="space-y-2">
                      {blockedDomains.map(domain => (
                        <div key={domain.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm break-all">{domain.domain}</div>
                            {domain.reason && <div className="text-xs text-muted-foreground mt-1 break-words">{domain.reason}</div>}
                            <div className="text-[11px] text-muted-foreground mt-1">
                              Added {new Date(domain.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveDomain(domain.id)}
                            className="text-sm text-destructive border border-destructive px-2 py-1 rounded-md hover:bg-destructive/10"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <Label className="text-base">Rate Limiting & Security</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ipRateLimit">IP Rate Limit</Label>
                <Input
                  id="ipRateLimit"
                  type="number"
                  value={ipRateLimit}
                  onChange={(e) => setIpRateLimit(e.target.value)}
                  placeholder="1000"
                />
                <p className="text-xs text-muted-foreground">
                  Requests per minute per IP (default: 1000)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sessionRateLimit">Admin Session Limit</Label>
                <Input
                  id="sessionRateLimit"
                  type="number"
                  value={sessionRateLimit}
                  onChange={(e) => setSessionRateLimit(e.target.value)}
                  placeholder="600"
                />
                <p className="text-xs text-muted-foreground">
                  Requests per minute per admin session (default: 600)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shareSessionRateLimit">Share Session Limit</Label>
                <Input
                  id="shareSessionRateLimit"
                  type="number"
                  value={shareSessionRateLimit}
                  onChange={(e) => setShareSessionRateLimit(e.target.value)}
                  placeholder="300"
                />
                <p className="text-xs text-muted-foreground">
                  Requests per minute per share session (default: 300)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordAttempts">Authentication Attempts</Label>
                <Input
                  id="passwordAttempts"
                  type="number"
                  value={passwordAttempts}
                  onChange={(e) => setPasswordAttempts(e.target.value)}
                  placeholder="5"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum authentication attempts (password or OTP) before lockout
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <Label className="text-base">Upload Security</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxUploadSizeGB">Max Upload Size (GB)</Label>
                <Input
                  id="maxUploadSizeGB"
                  type="number"
                  min={1}
                  max={100}
                  value={maxUploadSizeGB}
                  onChange={(e) => setMaxUploadSizeGB(e.target.value)}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum size per upload via TUS (1-100 GB)
                </p>
              </div>
            </div>
          </div>

          {/* Admin Session Timeout */}
          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <div>
              <Label className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Admin Session Timeout
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Controls inactivity logout in the admin dashboard. Maximum is 24 hours.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="adminSessionTimeoutValue">Timeout Value</Label>
                <Input
                  id="adminSessionTimeoutValue"
                  type="number"
                  min="1"
                  max={adminSessionTimeoutUnit === 'HOURS' ? '24' : '1440'}
                  value={adminSessionTimeoutValue}
                  onChange={(e) => setAdminSessionTimeoutValue(e.target.value)}
                  placeholder="15"
                />
              </div>

              <div className="space-y-2">
                <Label>Timeout Unit</Label>
                <Select value={adminSessionTimeoutUnit} onValueChange={setAdminSessionTimeoutUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MINUTES">Minutes</SelectItem>
                    <SelectItem value="HOURS">Hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">
                Current Setting: {formatDurationSetting(adminSessionTimeoutValue, adminSessionTimeoutUnit)}
              </p>
              <p className="text-xs text-muted-foreground mt-1 flex items-start gap-2">
                {(() => {
                  const val = parseInt(adminSessionTimeoutValue, 10) || 15
                  const unit = adminSessionTimeoutUnit
                  const seconds = unit === 'HOURS' ? val * 60 * 60 : val * 60
                  if (seconds <= 15 * 60) {
                    return <><CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-success" /> Short - strong security; sessions expire quickly</>
                  }
                  if (seconds <= 2 * 60 * 60) {
                    return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> Balanced - good for typical sessions</>
                  }
                  if (seconds <= 8 * 60 * 60) {
                    return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> Long - convenient for all-day sessions</>
                  }
                  return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Very long - consider the security trade-off</>
                })()}
              </p>
            </div>
          </div>

          {/* Client Session Timeout */}
          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <div>
              <Label className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Client Session Timeout
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Configure how long client share sessions stay active.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sessionTimeoutValue">Timeout Value</Label>
                <Input
                  id="sessionTimeoutValue"
                  type="number"
                  min="1"
                  max="52"
                  value={sessionTimeoutValue}
                  onChange={(e) => setSessionTimeoutValue(e.target.value)}
                  placeholder="15"
                />
              </div>

              <div className="space-y-2">
                <Label>Timeout Unit</Label>
                <Select value={sessionTimeoutUnit} onValueChange={setSessionTimeoutUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MINUTES">Minutes</SelectItem>
                    <SelectItem value="HOURS">Hours</SelectItem>
                    <SelectItem value="DAYS">Days</SelectItem>
                    <SelectItem value="WEEKS">Weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shareTokenTtlSeconds">Share JWT Token Expiry (seconds)</Label>
              <Input
                id="shareTokenTtlSeconds"
                type="number"
                min="60"
                max="86400"
                value={shareTokenTtlSeconds}
                onChange={(e) => setShareTokenTtlSeconds(e.target.value)}
                placeholder="Leave blank to use session timeout"
              />
              <p className="text-xs text-muted-foreground">
                Override share JWT expiry (60-86400 seconds). Leave blank to use session timeout above. Default: session timeout.
              </p>
            </div>

            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">
                Current Setting: {formatDurationSetting(sessionTimeoutValue, sessionTimeoutUnit)}
              </p>
              <p className="text-xs text-muted-foreground mt-1 flex items-start gap-2">
                {(() => {
                  const val = parseInt(sessionTimeoutValue, 10) || 15
                  const unit = sessionTimeoutUnit
                  if (unit === 'MINUTES') {
                    if (val < 5) return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Very short - sessions may expire while users are active</>
                    if (val <= 30) return <><CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-success" /> Short - strong security; sessions expire quickly</>
                    return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> Long - convenient for longer sessions</>
                  }
                  if (unit === 'HOURS') {
                    if (val <= 2) return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> Balanced - good for typical sessions</>
                    if (val <= 8) return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> Long - convenient for all-day sessions</>
                    return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Very long - consider the security trade-off</>
                  }
                  if (unit === 'DAYS') {
                    return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Extended - long-lived sessions; trusted environments only</>
                  }
                  if (unit === 'WEEKS') {
                    return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Maximum - long-lived sessions; use with caution</>
                  }
                  return ''
                })()}
              </p>
            </div>
          </div>

          <div className="space-y-4 border p-4 rounded-lg bg-muted/30">
            <Label className="text-base">Logging & Monitoring</Label>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="trackAnalytics">Track Analytics</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable analytics tracking for page visits and downloads
                </p>
              </div>
              <Switch
                id="trackAnalytics"
                checked={trackAnalytics}
                onCheckedChange={setTrackAnalytics}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="trackSecurityLogs">Track Security Logs</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable security event logging (hotlink attempts, rate limits, suspicious activity)
                </p>
              </div>
              <Switch
                id="trackSecurityLogs"
                checked={trackSecurityLogs}
                onCheckedChange={setTrackSecurityLogs}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="viewSecurityEvents">Show Security Dashboard</Label>
                <p className="text-xs text-muted-foreground">
                  Enable access to /admin/security page to view security events and logs (only visible when enabled)
                </p>
              </div>
              <Switch
                id="viewSecurityEvents"
                checked={viewSecurityEvents}
                onCheckedChange={setViewSecurityEvents}
              />
            </div>
          </div>
    </CollapsibleSection>
  )
}
