import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DomainConfigurationSectionProps {
  appDomain: string
  setAppDomain: (value: string) => void
}

export function DomainConfigurationSection({ appDomain, setAppDomain }: DomainConfigurationSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain Configuration</CardTitle>
        <CardDescription>
          Set your application domain for generating share links
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
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
      </CardContent>
    </Card>
  )
}
