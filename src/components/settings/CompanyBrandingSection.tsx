import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CollapsibleSection } from '@/components/ui/collapsible-section'

interface CompanyBrandingSectionProps {
  companyName: string
  setCompanyName: (value: string) => void
  show: boolean
  setShow: (value: boolean) => void
}

export function CompanyBrandingSection({ companyName, setCompanyName, show, setShow }: CompanyBrandingSectionProps) {
  return (
    <CollapsibleSection
      className="border-border"
      title="Company Branding"
      description="Customize how your company appears in the application"
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
    >
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label htmlFor="companyName">Company Name</Label>
        <Input
          id="companyName"
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g., Studio, Your Company Name"
        />
        <p className="text-xs text-muted-foreground">
          This name will be displayed in feedback messages and comments instead of &quot;Studio&quot;
        </p>
      </div>
    </CollapsibleSection>
  )
}
