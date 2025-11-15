import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Clock, AlertTriangle, CheckCircle, Lock, ChevronDown, ChevronUp } from 'lucide-react'

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
  passwordAttempts: string
  setPasswordAttempts: (value: string) => void
  sessionTimeoutValue: string
  setSessionTimeoutValue: (value: string) => void
  sessionTimeoutUnit: string
  setSessionTimeoutUnit: (value: string) => void
  trackAnalytics: boolean
  setTrackAnalytics: (value: boolean) => void
  trackSecurityLogs: boolean
  setTrackSecurityLogs: (value: boolean) => void
  viewSecurityEvents: boolean
  setViewSecurityEvents: (value: boolean) => void
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
  passwordAttempts,
  setPasswordAttempts,
  sessionTimeoutValue,
  setSessionTimeoutValue,
  sessionTimeoutUnit,
  setSessionTimeoutUnit,
  trackAnalytics,
  setTrackAnalytics,
  trackSecurityLogs,
  setTrackSecurityLogs,
  viewSecurityEvents,
  setViewSecurityEvents,
}: SecuritySettingsSectionProps) {
  return (
    <Card className="border-border">
      <CardHeader
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setShowSecuritySettings(!showSecuritySettings)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Advanced Security Settings</CardTitle>
            <CardDescription>
              Configure advanced security options
            </CardDescription>
          </div>
          {showSecuritySettings ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      {showSecuritySettings && (
        <CardContent className="space-y-4 border-t pt-4">
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
              <div className="flex items-center gap-2 flex-1">
                <Lock className="w-5 h-5 text-primary flex-shrink-0" />
                <Label htmlFor="httpsEnabled" className="text-base font-semibold">
                  HTTPS Enforcement
                </Label>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Switch
                  id="httpsEnabled"
                  checked={httpsEnabled}
                  onCheckedChange={setHttpsEnabled}
                />
                <span className="text-sm font-medium whitespace-nowrap">{httpsEnabled ? 'ON' : 'OFF'}</span>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                <strong>OFF:</strong> Use for local deployments with HTTP
              </p>
              <p className="text-muted-foreground">
                <strong>ON:</strong> Use for production deployments with HTTPS
              </p>

              {httpsEnabled && (
                <div className="mt-3 p-3 bg-primary-visible border-2 border-primary-visible rounded-md">
                  <p className="text-sm font-semibold text-primary mb-2">
                    When HTTPS is enabled, the following are enforced:
                  </p>
                  <ul className="text-xs text-primary space-y-1 list-disc list-inside">
                    <li>Cookies use <code className="bg-background px-1 py-0.5 rounded">secure: true</code> (only sent over HTTPS)</li>
                    <li>HSTS header enabled (forces browser to use HTTPS)</li>
                    <li>Enhanced security for all sessions and authentication</li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <Label htmlFor="hotlinkProtection">Hotlink Protection</Label>
            <select
              id="hotlinkProtection"
              value={hotlinkProtection}
              onChange={(e) => setHotlinkProtection(e.target.value)}
              className="w-full px-3 py-2 text-sm sm:text-base bg-background text-foreground border border-border rounded-md"
            >
              <option value="DISABLED">Disabled - No hotlink protection</option>
              <option value="LOG_ONLY">Log Only - Detect but allow</option>
              <option value="BLOCK_STRICT">Block Strict - Block suspected hotlinks</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Controls how the system handles hotlinking attempts. Log Only is recommended for monitoring.
            </p>
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <Label className="text-base">Rate Limiting & Security</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ipRateLimit">IP Rate Limit</Label>
                <Input
                  id="ipRateLimit"
                  type="number"
                  value={ipRateLimit}
                  onChange={(e) => setIpRateLimit(e.target.value)}
                  placeholder="300"
                />
                <p className="text-xs text-muted-foreground">
                  Requests per minute per IP
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sessionRateLimit">Session Rate Limit</Label>
                <Input
                  id="sessionRateLimit"
                  type="number"
                  value={sessionRateLimit}
                  onChange={(e) => setSessionRateLimit(e.target.value)}
                  placeholder="120"
                />
                <p className="text-xs text-muted-foreground">
                  Requests per minute per session
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

          {/* Client Session Timeout */}
          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <div>
              <Label className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Client Session Timeout
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Configure how long client share sessions stay active. Admin sessions always use 15 minutes with auto-refresh.
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
                <Label htmlFor="sessionTimeoutUnit">Timeout Unit</Label>
                <select
                  id="sessionTimeoutUnit"
                  value={sessionTimeoutUnit}
                  onChange={(e) => setSessionTimeoutUnit(e.target.value)}
                  className="w-full px-3 py-2 text-sm sm:text-base bg-background text-foreground border border-border rounded-md"
                >
                  <option value="MINUTES">Minutes</option>
                  <option value="HOURS">Hours</option>
                  <option value="DAYS">Days</option>
                  <option value="WEEKS">Weeks</option>
                </select>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">
                Current Setting: {sessionTimeoutValue} {sessionTimeoutUnit.toLowerCase()}
              </p>
              <p className="text-xs text-muted-foreground mt-1 flex items-start gap-2">
                {(() => {
                  const val = parseInt(sessionTimeoutValue) || 15
                  const unit = sessionTimeoutUnit
                  if (unit === 'MINUTES') {
                    if (val < 5) return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Very short - users may be logged out while actively viewing</>
                    if (val <= 30) return <><CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-success" /> Good for security - sessions expire quickly</>
                    return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> Longer timeout - convenient but less secure</>
                  }
                  if (unit === 'HOURS') {
                    if (val <= 2) return <><CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-success" /> Balanced - good for longer review sessions</>
                    if (val <= 8) return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> Long timeout - convenient for all-day access</>
                    return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Very long - consider security implications</>
                  }
                  if (unit === 'DAYS') {
                    return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Extended timeout - only use for trusted environments</>
                  }
                  if (unit === 'WEEKS') {
                    return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> Maximum timeout - use with caution</>
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
        </CardContent>
      )}
    </Card>
  )
}
