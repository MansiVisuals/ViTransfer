'use client'

import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { EmailSettingsContent, type EmailSettingsContentProps } from '@/components/settings/EmailSettingsSection'
import { ExternalNotificationsContent } from '@/components/settings/ExternalNotificationsSection'
import { WebPushSection } from '@/components/settings/WebPushSection'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface NotificationsSectionProps extends EmailSettingsContentProps {
  show: boolean
  setShow: (value: boolean) => void
  collapsible?: boolean
}

export function NotificationsSection({ show, setShow, collapsible, ...emailProps }: NotificationsSectionProps) {
  const [activeTab, setActiveTab] = useState<'email' | 'external' | 'browser'>('email')
  const t = useTranslations('settings')

  return (
    <CollapsibleSection
      className="border-border"
      title={t('notifications.title')}
      description={t('notifications.description')}
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-6 border-t pt-6"
      collapsible={collapsible}
    >
          <div
            role="tablist"
            aria-label={t('notifications.title')}
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
              {t('notifications.emailTab')}
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
              {t('notifications.pushTab')}
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
              {t('notifications.browserPushTab')}
            </button>
          </div>

          {activeTab === 'email' && (
            <div id="notifications-tabpanel-email" role="tabpanel" className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {t('notifications.emailDescription')}
              </div>
              <EmailSettingsContent {...emailProps} />
            </div>
          )}
          {activeTab === 'external' && (
            <div id="notifications-tabpanel-external" role="tabpanel" className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {t('notifications.pushDescription')}
              </div>
              <ExternalNotificationsContent active={show && activeTab === 'external'} showIntro={false} />
            </div>
          )}
          {activeTab === 'browser' && (
            <div id="notifications-tabpanel-browser" role="tabpanel" className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {t('notifications.browserPushDescription')}
              </div>
              <WebPushSection active={show && activeTab === 'browser'} />
            </div>
          )}
    </CollapsibleSection>
  )
}
