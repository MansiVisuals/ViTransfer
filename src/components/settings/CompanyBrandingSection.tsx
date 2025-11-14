import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface CompanyBrandingSectionProps {
  companyName: string
  setCompanyName: (value: string) => void
  show: boolean
  setShow: (value: boolean) => void
}

export function CompanyBrandingSection({ companyName, setCompanyName, show, setShow }: CompanyBrandingSectionProps) {
  return (
    <Card className="border-border">
      <CardHeader
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setShow(!show)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Company Branding</CardTitle>
            <CardDescription>
              Customize how your company appears in the application
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
      )}
    </Card>
  )
}
