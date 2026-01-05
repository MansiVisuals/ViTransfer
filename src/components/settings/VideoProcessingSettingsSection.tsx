import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface VideoProcessingSettingsSectionProps {
  defaultPreviewResolution: string
  setDefaultPreviewResolution: (value: string) => void
  defaultWatermarkEnabled: boolean
  setDefaultWatermarkEnabled: (value: boolean) => void
  defaultWatermarkText: string
  setDefaultWatermarkText: (value: string) => void
  defaultTimestampDisplay: string
  setDefaultTimestampDisplay: (value: string) => void
  autoApproveProject: boolean
  setAutoApproveProject: (value: boolean) => void
  show: boolean
  setShow: (value: boolean) => void
}

export function VideoProcessingSettingsSection({
  defaultPreviewResolution,
  setDefaultPreviewResolution,
  defaultWatermarkEnabled,
  setDefaultWatermarkEnabled,
  defaultWatermarkText,
  setDefaultWatermarkText,
  defaultTimestampDisplay,
  setDefaultTimestampDisplay,
  autoApproveProject,
  setAutoApproveProject,
  show,
  setShow,
}: VideoProcessingSettingsSectionProps) {
  return (
    <Card className="border-border">
      <CardHeader
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setShow(!show)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Default Project Settings</CardTitle>
            <CardDescription>
              Defaults applied when creating new projects
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
            <Label>Default Preview Resolution</Label>
            <Select value={defaultPreviewResolution} onValueChange={setDefaultPreviewResolution}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">720p (1280x720 or 720x1280 for vertical)</SelectItem>
                <SelectItem value="1080p">1080p (1920x1080 or 1080x1920 for vertical)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              New projects will use this resolution by default. Can be overridden per project.
            </p>
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <Label>Default Comment Timestamp Display</Label>
            <Select value={defaultTimestampDisplay} onValueChange={setDefaultTimestampDisplay}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TIMECODE">Timecode (HH:MM:SS:FF)</SelectItem>
                <SelectItem value="AUTO">Simple Time (MM:SS / HH:MM:SS)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for new projects by default. You can change this per project in Project Settings.
            </p>
          </div>

          <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="watermarkEnabled">Enable Watermarks</Label>
                <p className="text-xs text-muted-foreground">
                  Add watermarks to processed videos
                </p>
              </div>
              <Switch
                id="watermarkEnabled"
                checked={defaultWatermarkEnabled}
                onCheckedChange={setDefaultWatermarkEnabled}
              />
            </div>

            {defaultWatermarkEnabled && (
              <div className="space-y-2 pt-2 mt-2 border-t border-border">
                <Label htmlFor="watermark">Custom Watermark Text</Label>
                <Input
                  id="watermark"
                  value={defaultWatermarkText}
                  onChange={(e) => setDefaultWatermarkText(e.target.value)}
                  placeholder="e.g., PREVIEW, CONFIDENTIAL"
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use project-specific format. New projects will use this as default.
                  <br />
                  <span className="text-warning">Only letters, numbers, spaces, and these characters: - _ . ( )</span>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4 border p-4 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor="autoApproveProject">Auto-approve project when all videos are approved</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, the project is marked as APPROVED when all unique videos have at least one approved version.
                </p>
                <p className="text-xs text-warning mt-2">
                  Disable this if you upload videos one-by-one and don&apos;t want the project to auto-approve until you&apos;re ready.
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
