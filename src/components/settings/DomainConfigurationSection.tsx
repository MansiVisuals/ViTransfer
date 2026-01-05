import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CollapsibleSection } from '@/components/ui/collapsible-section'

interface DomainConfigurationSectionProps {
  appDomain: string
  setAppDomain: (value: string) => void
  show: boolean
  setShow: (value: boolean) => void
}

export function DomainConfigurationSection({ appDomain, setAppDomain, show, setShow }: DomainConfigurationSectionProps) {
  return (
    <CollapsibleSection
      className="border-border"
      title="Domain Configuration"
      description="Set your application domain for generating share links"
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
    >
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label htmlFor="appDomain">Application Domain</Label>
        <Input
          id="appDomain"
          type="text"
          value={appDomain}
          onChange={(e) => setAppDomain(e.target.value)}
          placeholder="e.g., https://yourdomain.com"
        />
        <p className="text-xs text-muted-foreground">
          Include protocol (https://) and no trailing slash. Used for generating share links.
        </p>
      </div>
    </CollapsibleSection>
  )
}
