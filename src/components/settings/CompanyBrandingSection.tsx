import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CompanyBrandingSectionProps {
  companyName: string
  setCompanyName: (value: string) => void
}

export function CompanyBrandingSection({ companyName, setCompanyName }: CompanyBrandingSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Branding</CardTitle>
        <CardDescription>
          Customize how your company appears in the application
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company Name</Label>
          <Input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g., Studio, Your Company Name"
          />
          <p className="text-xs text-muted-foreground">
            This name will be displayed in feedback messages and comments instead of "Studio"
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
