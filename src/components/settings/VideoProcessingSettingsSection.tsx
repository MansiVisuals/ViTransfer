import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface VideoProcessingSettingsSectionProps {
  defaultPreviewResolution: string
  setDefaultPreviewResolution: (value: string) => void
  defaultWatermarkText: string
  setDefaultWatermarkText: (value: string) => void
}

export function VideoProcessingSettingsSection({
  defaultPreviewResolution,
  setDefaultPreviewResolution,
  defaultWatermarkText,
  setDefaultWatermarkText,
}: VideoProcessingSettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Video Processing Settings</CardTitle>
        <CardDescription>
          Set default settings for new projects
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="resolution">Default Preview Resolution</Label>
          <select
            id="resolution"
            value={defaultPreviewResolution}
            onChange={(e) => setDefaultPreviewResolution(e.target.value)}
            className="w-full px-3 py-2 text-sm sm:text-base bg-background text-foreground border border-border rounded-md"
          >
            <option value="720p">720p (1280x720 or 720x1280 for vertical)</option>
            <option value="1080p">1080p (1920x1080 or 1080x1920 for vertical)</option>
          </select>
          <p className="text-xs text-muted-foreground">
            New projects will use this resolution by default. Can be overridden per project.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="watermark">Default Watermark Text</Label>
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
      </CardContent>
    </Card>
  )
}
