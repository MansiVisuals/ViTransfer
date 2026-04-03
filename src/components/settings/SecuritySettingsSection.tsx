import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { Clock, AlertTriangle, CheckCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

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
  httpsManagedByEnvironment: boolean
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
  maxCommentAttachments: string
  setMaxCommentAttachments: (value: string) => void
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
  collapsible?: boolean
}

export function SecuritySettingsSection({
  showSecuritySettings,
  setShowSecuritySettings,
  httpsEnabled,
  httpsManagedByEnvironment,
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
  maxCommentAttachments,
  setMaxCommentAttachments,
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
  collapsible,
}: SecuritySettingsSectionProps) {
  const t = useTranslations('settings')
  return (
    <CollapsibleSection
      className="border-border"
      title={t('security.title')}
      description={t('security.description')}
      open={showSecuritySettings}
      onOpenChange={setShowSecuritySettings}
      contentClassName="space-y-4 border-t pt-4"
      collapsible={collapsible}
    >
          <div className="p-3 bg-warning-visible border-2 border-warning-visible rounded-md">
            <p className="text-sm font-semibold text-warning">
              {t('security.warning')}
            </p>
            <p className="text-xs text-warning font-medium mt-1">
              {t('security.warningDescription')}
            </p>
          </div>

          {/* HTTPS Enforcement */}
          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="httpsEnabled">{t('security.httpsEnforcement')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('security.httpsHint')}
                </p>
              </div>
              <Switch
                id="httpsEnabled"
                checked={httpsEnabled}
                onCheckedChange={setHttpsEnabled}
                disabled={httpsManagedByEnvironment}
              />
            </div>

            {httpsManagedByEnvironment && (
              <div className="p-3 bg-warning-visible border-2 border-warning-visible rounded-md">
                <p className="text-xs text-warning">
                  {t('security.httpsManagedByEnvironment')}
                </p>
              </div>
            )}

            {httpsEnabled && (
              <div className="p-3 bg-primary-visible border-2 border-primary-visible rounded-md">
                <p className="text-xs text-primary">
                  {t('security.hstsEnabled')}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <Label>{t('security.hotlinkProtection')}</Label>
            <Select value={hotlinkProtection} onValueChange={setHotlinkProtection}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DISABLED">{t('security.hotlinkDisabled')}</SelectItem>
                <SelectItem value="LOG_ONLY">{t('security.hotlinkLogOnly')}</SelectItem>
                <SelectItem value="BLOCK_STRICT">{t('security.hotlinkBlockStrict')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('security.hotlinkHint')}
            </p>
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <Label className="text-base">{t('security.rateLimiting')}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ipRateLimit">{t('security.ipRateLimit')}</Label>
                <Input
                  id="ipRateLimit"
                  type="number"
                  value={ipRateLimit}
                  onChange={(e) => setIpRateLimit(e.target.value)}
                  placeholder="1000"
                />
                <p className="text-xs text-muted-foreground">
                  {t('security.ipRateLimitHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sessionRateLimit">{t('security.adminSessionLimit')}</Label>
                <Input
                  id="sessionRateLimit"
                  type="number"
                  value={sessionRateLimit}
                  onChange={(e) => setSessionRateLimit(e.target.value)}
                  placeholder="600"
                />
                <p className="text-xs text-muted-foreground">
                  {t('security.adminSessionLimitHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shareSessionRateLimit">{t('security.shareSessionLimit')}</Label>
                <Input
                  id="shareSessionRateLimit"
                  type="number"
                  value={shareSessionRateLimit}
                  onChange={(e) => setShareSessionRateLimit(e.target.value)}
                  placeholder="300"
                />
                <p className="text-xs text-muted-foreground">
                  {t('security.shareSessionLimitHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordAttempts">{t('security.authAttempts')}</Label>
                <Input
                  id="passwordAttempts"
                  type="number"
                  value={passwordAttempts}
                  onChange={(e) => setPasswordAttempts(e.target.value)}
                  placeholder="5"
                />
                <p className="text-xs text-muted-foreground">
                  {t('security.authAttemptsHint')}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <Label className="text-base">{t('security.uploadSecurity')}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxUploadSizeGB">{t('security.maxUploadSize')}</Label>
                <Input
                  id="maxUploadSizeGB"
                  type="number"
                  min={1}
                  max={1000}
                  value={maxUploadSizeGB}
                  onChange={(e) => setMaxUploadSizeGB(e.target.value)}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">
                  {t('security.maxUploadSizeHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxCommentAttachments">{t('security.maxAttachments')}</Label>
                <Input
                  id="maxCommentAttachments"
                  type="number"
                  min={1}
                  max={50}
                  value={maxCommentAttachments}
                  onChange={(e) => setMaxCommentAttachments(e.target.value)}
                  placeholder="10"
                />
                <p className="text-xs text-muted-foreground">
                  {t('security.maxAttachmentsHint')}
                </p>
              </div>
            </div>
          </div>

          {/* Admin Session Timeout */}
          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <div>
              <Label className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t('security.adminSessionTimeout')}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t('security.adminSessionTimeoutHint')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="adminSessionTimeoutValue">{t('security.timeoutValue')}</Label>
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
                <Label>{t('security.timeoutUnit')}</Label>
                <Select value={adminSessionTimeoutUnit} onValueChange={setAdminSessionTimeoutUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MINUTES">{t('security.minutes')}</SelectItem>
                    <SelectItem value="HOURS">{t('security.hours')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">
                {t('security.currentSetting')} {formatDurationSetting(adminSessionTimeoutValue, adminSessionTimeoutUnit)}
              </p>
              <p className="text-xs text-muted-foreground mt-1 flex items-start gap-2">
                {(() => {
                  const val = parseInt(adminSessionTimeoutValue, 10) || 15
                  const unit = adminSessionTimeoutUnit
                  const seconds = unit === 'HOURS' ? val * 60 * 60 : val * 60
                  if (seconds <= 15 * 60) {
                    return <><CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-success" /> {t('security.shortSecurity')}</>
                  }
                  if (seconds <= 2 * 60 * 60) {
                    return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> {t('security.balanced')}</>
                  }
                  if (seconds <= 8 * 60 * 60) {
                    return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> {t('security.longConvenient')}</>
                  }
                  return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> {t('security.veryLong')}</>
                })()}
              </p>
            </div>
          </div>

          {/* Client Session Timeout */}
          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <div>
              <Label className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t('security.clientSessionTimeout')}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t('security.clientSessionTimeoutHint')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sessionTimeoutValue">{t('security.timeoutValue')}</Label>
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
                <Label>{t('security.timeoutUnit')}</Label>
                <Select value={sessionTimeoutUnit} onValueChange={setSessionTimeoutUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MINUTES">{t('security.minutes')}</SelectItem>
                    <SelectItem value="HOURS">{t('security.hours')}</SelectItem>
                    <SelectItem value="DAYS">{t('security.days')}</SelectItem>
                    <SelectItem value="WEEKS">{t('security.weeks')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shareTokenTtlSeconds">{t('security.shareTokenExpiry')}</Label>
              <Input
                id="shareTokenTtlSeconds"
                type="number"
                min="60"
                max="86400"
                value={shareTokenTtlSeconds}
                onChange={(e) => setShareTokenTtlSeconds(e.target.value)}
                placeholder={t('security.leaveBlank')}
              />
              <p className="text-xs text-muted-foreground">
                {t('security.shareTokenOverride')}
              </p>
            </div>

            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">
                {t('security.currentSetting')} {formatDurationSetting(sessionTimeoutValue, sessionTimeoutUnit)}
              </p>
              <p className="text-xs text-muted-foreground mt-1 flex items-start gap-2">
                {(() => {
                  const val = parseInt(sessionTimeoutValue, 10) || 15
                  const unit = sessionTimeoutUnit
                  if (unit === 'MINUTES') {
                    if (val < 5) return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> {t('security.veryShort')}</>
                    if (val <= 30) return <><CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-success" /> {t('security.shortSecurity')}</>
                    return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> {t('security.longSessions')}</>
                  }
                  if (unit === 'HOURS') {
                    if (val <= 2) return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> {t('security.balanced')}</>
                    if (val <= 8) return <><Clock className="w-3 h-3 mt-0.5 flex-shrink-0" /> {t('security.longConvenient')}</>
                    return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> {t('security.veryLong')}</>
                  }
                  if (unit === 'DAYS') {
                    return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> {t('security.extended')}</>
                  }
                  if (unit === 'WEEKS') {
                    return <><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-warning" /> {t('security.maximum')}</>
                  }
                  return ''
                })()}
              </p>
            </div>
          </div>

          <div className="space-y-4 border p-4 rounded-lg bg-muted/30">
            <Label className="text-base">{t('security.logging')}</Label>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="trackAnalytics">{t('security.trackAnalytics')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('security.trackAnalyticsHint')}
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
                <Label htmlFor="trackSecurityLogs">{t('security.trackSecurityLogs')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('security.trackSecurityLogsHint')}
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
                <Label htmlFor="viewSecurityEvents">{t('security.showSecurityDashboard')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('security.showSecurityDashboardHint')}
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
