import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { ScheduleSelector } from '@/components/ScheduleSelector'
import { Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface EmailSettingsSectionProps {
  // SMTP Settings
  smtpServer: string
  setSmtpServer: (value: string) => void
  smtpPort: string
  setSmtpPort: (value: string) => void
  smtpUsername: string
  setSmtpUsername: (value: string) => void
  smtpPassword: string
  setSmtpPassword: (value: string) => void
  smtpFromAddress: string
  setSmtpFromAddress: (value: string) => void
  smtpSecure: string
  setSmtpSecure: (value: string) => void

  // Test Email
  testEmailAddress: string
  setTestEmailAddress: (value: string) => void
  testEmailSending: boolean
  testEmailResult: { type: 'success' | 'error'; message: string } | null
  handleTestEmail: () => void

  // Admin Notifications
  adminNotificationSchedule: string
  setAdminNotificationSchedule: (value: string) => void
  adminNotificationTime: string
  setAdminNotificationTime: (value: string) => void
  adminNotificationDay: number
  setAdminNotificationDay: (value: number) => void

  // Collapsible state
  show: boolean
  setShow: (value: boolean) => void
}

export function EmailSettingsSection({
  smtpServer,
  setSmtpServer,
  smtpPort,
  setSmtpPort,
  smtpUsername,
  setSmtpUsername,
  smtpPassword,
  setSmtpPassword,
  smtpFromAddress,
  setSmtpFromAddress,
  smtpSecure,
  setSmtpSecure,
  testEmailAddress,
  setTestEmailAddress,
  testEmailSending,
  testEmailResult,
  handleTestEmail,
  adminNotificationSchedule,
  setAdminNotificationSchedule,
  adminNotificationTime,
  setAdminNotificationTime,
  adminNotificationDay,
  setAdminNotificationDay,
  show,
  setShow,
}: EmailSettingsSectionProps) {
  return (
    <Card className="border-border">
      <CardHeader
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setShow(!show)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Email / SMTP & Notifications</CardTitle>
            <CardDescription>
              Configure SMTP settings and notification schedules
            </CardDescription>
          </div>
          {show ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      {show && (
        <CardContent className="space-y-4 border-t pt-4">
        <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
          <Label className="text-base">SMTP Configuration</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="smtpServer">SMTP Server</Label>
            <Input
              id="smtpServer"
              type="text"
              value={smtpServer}
              onChange={(e) => setSmtpServer(e.target.value)}
              placeholder="e.g., smtp.provider.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtpPort">Port</Label>
            <Input
              id="smtpPort"
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="587"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="smtpFromAddress">From Email Address</Label>
          <Input
            id="smtpFromAddress"
            type="email"
            value={smtpFromAddress}
            onChange={(e) => setSmtpFromAddress(e.target.value)}
            placeholder="e.g., email@yourdomain.com"
          />
        </div>

        <div className="space-y-2">
          <Label>Security / Encryption</Label>
          <div className="space-y-3 p-4 bg-muted/50 rounded-md border border-border">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="smtpSecure"
                value="STARTTLS"
                checked={smtpSecure === 'STARTTLS'}
                onChange={(e) => setSmtpSecure(e.target.value)}
                className="mt-1 h-4 w-4 text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <div className="font-medium text-sm group-hover:text-primary transition-colors">
                  STARTTLS (Recommended)
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Port 587 recommended. Most secure option for modern email providers.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="smtpSecure"
                value="TLS"
                checked={smtpSecure === 'TLS'}
                onChange={(e) => setSmtpSecure(e.target.value)}
                className="mt-1 h-4 w-4 text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <div className="font-medium text-sm group-hover:text-primary transition-colors">
                  TLS/SSL
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Port 465 recommended. Legacy secure connection method.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="smtpSecure"
                value="NONE"
                checked={smtpSecure === 'NONE'}
                onChange={(e) => setSmtpSecure(e.target.value)}
                className="mt-1 h-4 w-4 text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <div className="font-medium text-sm group-hover:text-primary transition-colors">
                  None
                </div>
                <div className="text-xs text-destructive mt-1">
                  Port 25 or custom. Not recommended - credentials sent unencrypted.
                </div>
              </div>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="smtpUsername">SMTP Username</Label>
          <Input
            id="smtpUsername"
            type="text"
            value={smtpUsername}
            onChange={(e) => setSmtpUsername(e.target.value)}
            placeholder="SMTP username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="smtpPassword">SMTP Password</Label>
          <PasswordInput
            id="smtpPassword"
            value={smtpPassword}
            onChange={(e) => setSmtpPassword(e.target.value)}
            placeholder="SMTP password or app password"
          />
          <p className="text-xs text-muted-foreground">
            For iCloud or Gmail, use an App Specific Password. For other providers, use your SMTP password.
          </p>
        </div>
        </div>

        <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
          <Label className="text-base">Test Email Configuration</Label>
          <p className="text-xs text-muted-foreground">
            Test your email configuration with the current form values before saving. This helps ensure your settings are correct.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="testEmailAddress">Test Email Address</Label>
              <Input
                id="testEmailAddress"
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="Enter email to receive test"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleTestEmail}
              disabled={testEmailSending || !testEmailAddress}
              className="w-full"
              size="default"
            >
              {testEmailSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending Test Email...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Test Email
                </>
              )}
            </Button>

            {testEmailResult && (
              <div className={`p-3 rounded-lg text-xs sm:text-sm font-medium ${
                testEmailResult.type === 'success'
                  ? 'bg-success-visible text-success border-2 border-success-visible'
                  : 'bg-destructive-visible text-destructive border-2 border-destructive-visible'
              }`}>
                {testEmailResult.message}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
          <ScheduleSelector
            schedule={adminNotificationSchedule}
            time={adminNotificationTime}
            day={adminNotificationDay}
            onScheduleChange={setAdminNotificationSchedule}
            onTimeChange={setAdminNotificationTime}
            onDayChange={setAdminNotificationDay}
            label="Admin Notification Schedule"
            description="Configure when you receive summaries of client comments across all projects. Note: Approval emails are always sent immediately."
          />
        </div>
      </CardContent>
      )}
    </Card>
  )
}
