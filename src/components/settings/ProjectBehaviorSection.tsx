import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

interface ProjectBehaviorSectionProps {
  autoApproveProject: boolean
  setAutoApproveProject: (value: boolean) => void
}

export function ProjectBehaviorSection({
  autoApproveProject,
  setAutoApproveProject,
}: ProjectBehaviorSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Behavior</CardTitle>
        <CardDescription>
          Configure how projects behave when videos are approved
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="autoApproveProject" className="flex items-center gap-2 cursor-pointer">
            <input
              id="autoApproveProject"
              type="checkbox"
              checked={autoApproveProject}
              onChange={(e) => setAutoApproveProject(e.target.checked)}
              className="w-4 h-4"
            />
            Auto-approve project when all videos are approved
          </Label>
          <p className="text-xs text-muted-foreground">
            When enabled, the project will automatically be marked as APPROVED when all unique videos have at least one approved version.
            <br />
            <span className="text-warning">Disable this if you upload videos one-by-one and don&apos;t want the project to auto-approve until you&apos;re ready.</span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
