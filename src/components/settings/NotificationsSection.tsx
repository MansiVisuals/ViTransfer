'use client'

import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { EmailSettingsContent, type EmailSettingsContentProps } from '@/components/settings/EmailSettingsSection'
import { ExternalNotificationsContent } from '@/components/settings/ExternalNotificationsSection'
import { WebPushSection } from '@/components/settings/WebPushSection'
import { useState } from 'react'

interface NotificationsSectionProps extends EmailSettingsContentProps {
  show: boolean
  setShow: (value: boolean) => void
}

export function NotificationsSection({ show, setShow, ...emailProps }: NotificationsSectionProps) {
  const [activeTab, setActiveTab] = useState<'email' | 'external' | 'browser'>('email')

  return (
    <CollapsibleSection
      className="border-border"
      title="Email & Push Notifications"
      description="Configure email and push notification destinations"
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-6 border-t pt-6"
    >
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
              Push Services
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'browser'}
              aria-controls="notifications-tabpanel-browser"
              className={[
                'flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors',
                activeTab === 'browser'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground',
              ].join(' ')}
              onClick={() => setActiveTab('browser')}
            >
              Browser Push
            </button>
          </div>

          {activeTab === 'email' && (
            <div id="notifications-tabpanel-email" role="tabpanel" className="space-y-4">
              <div className="text-xs text-muted-foreground">
                SMTP configuration, test email, and admin summary schedule.
              </div>
              <EmailSettingsContent {...emailProps} />
            </div>
          )}
          {activeTab === 'external' && (
            <div id="notifications-tabpanel-external" role="tabpanel" className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Send push notifications to Gotify, ntfy, Pushover, or Telegram.
              </div>
              <ExternalNotificationsContent active={show && activeTab === 'external'} showIntro={false} />
            </div>
          )}
          {activeTab === 'browser' && (
            <div id="notifications-tabpanel-browser" role="tabpanel" className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Receive push notifications directly in your browser. Works across all your devices.
              </div>
              <WebPushSection active={show && activeTab === 'browser'} />
            </div>
          )}
    </CollapsibleSection>
  )
}
