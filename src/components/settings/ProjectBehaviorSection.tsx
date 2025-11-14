import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface ProjectBehaviorSectionProps {
  autoApproveProject: boolean
  setAutoApproveProject: (value: boolean) => void
  show: boolean
  setShow: (value: boolean) => void
}

export function ProjectBehaviorSection({
  autoApproveProject,
  setAutoApproveProject,
  show,
  setShow,
}: ProjectBehaviorSectionProps) {
  return (
    <Card className="border-border">
      <CardHeader
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setShow(!show)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Project Behavior</CardTitle>
            <CardDescription>
              Configure how projects behave when videos are approved
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
          <div className="space-y-4 border p-4 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="autoApproveProject">Auto-approve project when all videos are approved</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, the project will automatically be marked as APPROVED when all unique videos have at least one approved version.
                  <br />
                  <span className="text-warning">Disable this if you upload videos one-by-one and don&apos;t want the project to auto-approve until you&apos;re ready.</span>
                </p>
              </div>
              <Switch
                id="autoApproveProject"
                checked={autoApproveProject}
                onCheckedChange={setAutoApproveProject}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
