import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface DomainConfigurationSectionProps {
  appDomain: string
  setAppDomain: (value: string) => void
  show: boolean
  setShow: (value: boolean) => void
}

export function DomainConfigurationSection({ appDomain, setAppDomain, show, setShow }: DomainConfigurationSectionProps) {
  return (
    <Card className="border-border">
      <CardHeader
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setShow(!show)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Domain Configuration</CardTitle>
            <CardDescription>
              Set your application domain for generating share links
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
      )}
    </Card>
  )
}
