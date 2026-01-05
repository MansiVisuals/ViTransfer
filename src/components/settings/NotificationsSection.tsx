'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { EmailSettingsContent, type EmailSettingsContentProps } from '@/components/settings/EmailSettingsSection'
import { ExternalNotificationsContent } from '@/components/settings/ExternalNotificationsSection'
import { useState } from 'react'

interface NotificationsSectionProps extends EmailSettingsContentProps {
  show: boolean
  setShow: (value: boolean) => void
}

export function NotificationsSection({ show, setShow, ...emailProps }: NotificationsSectionProps) {
  const [activeTab, setActiveTab] = useState<'email' | 'external'>('email')

  return (
    <Card className="border-border">
      <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setShow(!show)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Email & Push Notifications</CardTitle>
            <CardDescription>Configure email and push notification destinations</CardDescription>
          </div>
          {show ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      {show && (
        <CardContent className="space-y-6 border-t pt-6">
          <div
            role="tablist"
            aria-label="Notification settings"
            className="inline-flex w-full gap-2"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'email'}
              aria-controls="notifications-tabpanel-email"
              className={[
                'flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors',
                activeTab === 'email'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground',
              ].join(' ')}
              onClick={() => setActiveTab('email')}
            >
              Email
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'external'}
              aria-controls="notifications-tabpanel-external"
              className={[
                'flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors',
                activeTab === 'external'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground',
              ].join(' ')}
              onClick={() => setActiveTab('external')}
            >
              Push Notifications
            </button>
          </div>

          {activeTab === 'email' ? (
            <div id="notifications-tabpanel-email" role="tabpanel" className="space-y-4">
              <div className="text-xs text-muted-foreground">
                SMTP configuration, test email, and admin summary schedule.
              </div>
              <EmailSettingsContent {...emailProps} />
            </div>
          ) : (
            <div id="notifications-tabpanel-external" role="tabpanel" className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Send push notifications to Gotify, ntfy, Pushover, or Telegram.
              </div>
              <ExternalNotificationsContent active={show && activeTab === 'external'} showIntro={false} />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
