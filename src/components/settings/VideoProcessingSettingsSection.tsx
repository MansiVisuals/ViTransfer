import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { useTranslations } from 'next-intl'

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
  defaultUsePreviewForApprovedPlayback: boolean
  setDefaultUsePreviewForApprovedPlayback: (value: boolean) => void
  defaultAllowClientAssetUpload: boolean
  setDefaultAllowClientAssetUpload: (value: boolean) => void
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
  defaultUsePreviewForApprovedPlayback,
  setDefaultUsePreviewForApprovedPlayback,
  defaultAllowClientAssetUpload,
  setDefaultAllowClientAssetUpload,
  show,
  setShow,
}: VideoProcessingSettingsSectionProps) {
  const t = useTranslations('settings')
  return (
    <CollapsibleSection
      className="border-border"
      title={t('videoProcessing.title')}
      description={t('videoProcessing.description')}
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
    >
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label>{t('videoProcessing.previewResolution')}</Label>
        <Select value={defaultPreviewResolution} onValueChange={setDefaultPreviewResolution}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="720p">{t('videoProcessing.resolution720')}</SelectItem>
            <SelectItem value="1080p">{t('videoProcessing.resolution1080')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('videoProcessing.resolutionHint')}
        </p>
      </div>

      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label>{t('videoProcessing.timestampDisplay')}</Label>
        <Select value={defaultTimestampDisplay} onValueChange={setDefaultTimestampDisplay}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TIMECODE">{t('videoProcessing.timecode')}</SelectItem>
            <SelectItem value="AUTO">{t('videoProcessing.simpleTime')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('videoProcessing.timestampHint')}
        </p>
      </div>

      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="watermarkEnabled">{t('videoProcessing.enableWatermarks')}</Label>
            <p className="text-xs text-muted-foreground">{t('videoProcessing.enableWatermarksHint')}</p>
          </div>
          <Switch id="watermarkEnabled" checked={defaultWatermarkEnabled} onCheckedChange={setDefaultWatermarkEnabled} />
        </div>

        {defaultWatermarkEnabled && (
          <div className="space-y-2 pt-2 mt-2 border-t border-border">
            <Label htmlFor="watermark">{t('videoProcessing.customWatermarkText')}</Label>
            <Input
              id="watermark"
              value={defaultWatermarkText}
              onChange={(e) => setDefaultWatermarkText(e.target.value)}
              placeholder={t('videoProcessing.watermarkPlaceholder')}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              {t('videoProcessing.watermarkHint')}
              <br />
              <span className="text-warning">{t('videoProcessing.watermarkCharsAllowed')}</span>
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="defaultUsePreviewForApprovedPlayback">{t('videoProcessing.usePreviewApproved')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('videoProcessing.usePreviewApprovedHint')}
            </p>
          </div>
          <Switch
            id="defaultUsePreviewForApprovedPlayback"
            checked={defaultUsePreviewForApprovedPlayback}
            onCheckedChange={setDefaultUsePreviewForApprovedPlayback}
          />
        </div>
        {defaultUsePreviewForApprovedPlayback && defaultWatermarkEnabled && (
          <p className="text-xs text-muted-foreground italic">
            {t('videoProcessing.cleanPreviewNote')}
          </p>
        )}
      </div>

      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="defaultAllowClientAssetUpload">{t('videoProcessing.clientAttachments')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('videoProcessing.clientAttachmentsHint')}
            </p>
          </div>
          <Switch
            id="defaultAllowClientAssetUpload"
            checked={defaultAllowClientAssetUpload}
            onCheckedChange={setDefaultAllowClientAssetUpload}
          />
        </div>
      </div>

      <div className="space-y-4 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5 flex-1">
            <Label htmlFor="autoApproveProject">{t('videoProcessing.autoApprove')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('videoProcessing.autoApproveHint')}
            </p>
            <p className="text-xs text-warning mt-2">
              {t('videoProcessing.autoApproveDisableHint')}
            </p>
          </div>
          <Switch id="autoApproveProject" checked={autoApproveProject} onCheckedChange={setAutoApproveProject} />
        </div>
      </div>
    </CollapsibleSection>
  )
}
