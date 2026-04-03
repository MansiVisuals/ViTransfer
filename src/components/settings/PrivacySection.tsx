import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface PrivacySectionProps {
  privacyDisclosureEnabled: boolean
  setPrivacyDisclosureEnabled: (value: boolean) => void
  privacyDisclosureText: string
  setPrivacyDisclosureText: (value: string) => void
  show: boolean
  setShow: (value: boolean) => void
  collapsible?: boolean
}

export function PrivacySection({
  privacyDisclosureEnabled,
  setPrivacyDisclosureEnabled,
  privacyDisclosureText,
  setPrivacyDisclosureText,
  show,
  setShow,
  collapsible,
}: PrivacySectionProps) {
  const t = useTranslations('settings')

  return (
    <CollapsibleSection
      className="border-border"
      title={t('privacy.title')}
      description={t('privacy.description')}
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
      collapsible={collapsible}
    >
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              {t('appearance.privacyDisclosure')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('appearance.privacyDisclosureDescription')}
            </p>
          </div>
          <Switch
            checked={privacyDisclosureEnabled}
            onCheckedChange={setPrivacyDisclosureEnabled}
          />
        </div>
        {privacyDisclosureEnabled && (
          <div className="space-y-2">
            <Label>{t('appearance.privacyDisclosureCustomText')}</Label>
            <textarea
              value={privacyDisclosureText}
              onChange={(e) => setPrivacyDisclosureText(e.target.value)}
              placeholder={t('appearance.privacyDisclosurePlaceholder')}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">
              {t('appearance.privacyDisclosureHint')}
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
