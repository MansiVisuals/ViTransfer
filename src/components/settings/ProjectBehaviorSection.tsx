import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CollapsibleSection } from '@/components/ui/collapsible-section'

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
    <CollapsibleSection
      className="border-border"
      title="Project Behavior"
      description="Configure how projects behave when videos are approved"
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
    >
      <div className="space-y-4 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="autoApproveProject">Auto-approve project when all videos are approved</Label>
            <p className="text-xs text-muted-foreground">
              When enabled, the project will automatically be marked as APPROVED when all unique videos have at least
              one approved version.
              <br />
              <span className="text-warning">
                Disable this if you upload videos one-by-one and don&apos;t want the project to auto-approve until
                you&apos;re ready.
              </span>
            </p>
          </div>
          <Switch id="autoApproveProject" checked={autoApproveProject} onCheckedChange={setAutoApproveProject} />
        </div>
      </div>
    </CollapsibleSection>
  )
}
