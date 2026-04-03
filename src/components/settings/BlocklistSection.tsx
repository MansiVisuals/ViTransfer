import React from 'react'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { useTranslations } from 'next-intl'

interface BlocklistSectionProps {
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
  show: boolean
  setShow: (value: boolean) => void
  collapsible?: boolean
}

export function BlocklistSection({
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
  show,
  setShow,
  collapsible,
}: BlocklistSectionProps) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')

  return (
    <CollapsibleSection
      className="border-border"
      title={t('blocklist.title')}
      description={t('blocklist.description')}
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
      collapsible={collapsible}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">{t('security.hotlinkBlocklists')}</h4>
          {blocklistsLoading && <span className="text-xs text-muted-foreground">{t('security.refreshing')}</span>}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2 border p-4 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground font-medium">{t('security.blockedIPs')}</p>
            <form
              onSubmit={onAddIP}
              className="flex flex-col gap-2"
            >
              <input
                type="text"
                value={newIP}
                onChange={(e) => setNewIP(e.target.value)}
                placeholder={t('security.ipPlaceholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
              <input
                type="text"
                value={newIPReason}
                onChange={(e) => setNewIPReason(e.target.value)}
                placeholder={t('security.reasonPlaceholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
              <button
                type="submit"
                className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md w-full sm:w-auto"
              >
                {tc('add')}
              </button>
            </form>
            {blockedIPs.length === 0 ? (
              <div className="text-xs text-muted-foreground">{t('security.noBlockedIPs')}</div>
            ) : (
              <div className="space-y-2">
                {blockedIPs.map(ip => (
                  <div key={ip.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm break-all">{ip.ipAddress}</div>
                      {ip.reason && <div className="text-xs text-muted-foreground mt-1 break-words">{ip.reason}</div>}
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {t('security.added')} {new Date(ip.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveIP(ip.id)}
                      className="text-sm text-destructive border border-destructive px-2 py-1 rounded-md hover:bg-destructive/10"
                    >
                      {tc('remove')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 border p-4 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground font-medium">{t('security.blockedDomains')}</p>
            <form
              onSubmit={onAddDomain}
              className="flex flex-col gap-2"
            >
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder={t('security.domainPlaceholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
              <input
                type="text"
                value={newDomainReason}
                onChange={(e) => setNewDomainReason(e.target.value)}
                placeholder={t('security.reasonPlaceholder')}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              />
              <button
                type="submit"
                className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md w-full sm:w-auto"
              >
                {tc('add')}
              </button>
            </form>
            {blockedDomains.length === 0 ? (
              <div className="text-xs text-muted-foreground">{t('security.noBlockedDomains')}</div>
            ) : (
              <div className="space-y-2">
                {blockedDomains.map(domain => (
                  <div key={domain.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm break-all">{domain.domain}</div>
                      {domain.reason && <div className="text-xs text-muted-foreground mt-1 break-words">{domain.reason}</div>}
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {t('security.added')} {new Date(domain.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveDomain(domain.id)}
                      className="text-sm text-destructive border border-destructive px-2 py-1 rounded-md hover:bg-destructive/10"
                    >
                      {tc('remove')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
