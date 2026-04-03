import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { useTranslations } from 'next-intl'

const WATERMARK_POSITIONS = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const

interface VideoProcessingSettingsSectionProps {
  defaultPreviewResolution: string
  setDefaultPreviewResolution: (value: string) => void
  defaultSkipTranscoding: boolean
  setDefaultSkipTranscoding: (value: boolean) => void
  defaultWatermarkEnabled: boolean
  setDefaultWatermarkEnabled: (value: boolean) => void
  defaultWatermarkText: string
  setDefaultWatermarkText: (value: string) => void
  defaultWatermarkPositions: string
  setDefaultWatermarkPositions: (value: string) => void
  defaultWatermarkOpacity: number
  setDefaultWatermarkOpacity: (value: number) => void
  defaultWatermarkFontSize: string
  setDefaultWatermarkFontSize: (value: string) => void
  defaultApplyPreviewLut: boolean
  setDefaultApplyPreviewLut: (value: boolean) => void
  show: boolean
  setShow: (value: boolean) => void
  collapsible?: boolean
}

export function VideoProcessingSettingsSection({
  defaultPreviewResolution,
  setDefaultPreviewResolution,
  defaultSkipTranscoding,
  setDefaultSkipTranscoding,
  defaultWatermarkEnabled,
  setDefaultWatermarkEnabled,
  defaultWatermarkText,
  setDefaultWatermarkText,
  defaultWatermarkPositions,
  setDefaultWatermarkPositions,
  defaultWatermarkOpacity,
  setDefaultWatermarkOpacity,
  defaultWatermarkFontSize,
  setDefaultWatermarkFontSize,
  defaultApplyPreviewLut,
  setDefaultApplyPreviewLut,
  show,
  setShow,
  collapsible,
}: VideoProcessingSettingsSectionProps) {
  const t = useTranslations('settings')

  const selectedPositions = defaultWatermarkPositions.split(',').map(p => p.trim()).filter(Boolean)

  function togglePosition(pos: string) {
    const current = new Set(selectedPositions)
    if (current.has(pos)) {
      current.delete(pos)
      // Must have at least one position
      if (current.size === 0) return
    } else {
      current.add(pos)
    }
    setDefaultWatermarkPositions(Array.from(current).join(','))
  }

  return (
    <CollapsibleSection
      className="border-border"
      title={t('videoProcessing.title')}
      description={t('videoProcessing.description')}
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
      collapsible={collapsible}
    >
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="defaultSkipTranscoding">{t('videoProcessing.skipTranscoding')}</Label>
            <p className="text-xs text-muted-foreground">{t('videoProcessing.skipTranscodingHint')}</p>
          </div>
          <Switch id="defaultSkipTranscoding" checked={defaultSkipTranscoding} onCheckedChange={(checked) => {
            setDefaultSkipTranscoding(checked)
            if (checked) {
              setDefaultWatermarkEnabled(false)
              setDefaultApplyPreviewLut(false)
            }
          }} />
        </div>
        {defaultSkipTranscoding && (
          <p className="text-xs text-warning">{t('videoProcessing.skipTranscodingWarning')}</p>
        )}
      </div>

      {!defaultSkipTranscoding && (
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
      )}

      {!defaultSkipTranscoding && (
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="defaultApplyPreviewLut">{t('videoProcessing.applyPreviewLut')}</Label>
            <p className="text-xs text-muted-foreground">{t('videoProcessing.applyPreviewLutHint')}</p>
          </div>
          <Switch id="defaultApplyPreviewLut" checked={defaultApplyPreviewLut} onCheckedChange={setDefaultApplyPreviewLut} />
        </div>
      </div>
      )}

      {!defaultSkipTranscoding && (
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="watermarkEnabled">{t('videoProcessing.enableWatermarks')}</Label>
            <p className="text-xs text-muted-foreground">{t('videoProcessing.enableWatermarksHint')}</p>
          </div>
          <Switch id="watermarkEnabled" checked={defaultWatermarkEnabled} onCheckedChange={setDefaultWatermarkEnabled} />
        </div>

        {defaultWatermarkEnabled && (
          <div className="space-y-4 pt-2 mt-2 border-t border-border">
            <div className="space-y-2">
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

            <div className="space-y-2">
              <Label>{t('videoProcessing.watermarkPositions')}</Label>
              <p className="text-xs text-muted-foreground">{t('videoProcessing.watermarkPositionsHint')}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {WATERMARK_POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => togglePosition(pos)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                      selectedPositions.includes(pos)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {t(`videoProcessing.position.${pos}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('videoProcessing.watermarkFontSize')}</Label>
              <Select value={defaultWatermarkFontSize} onValueChange={setDefaultWatermarkFontSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">{t('videoProcessing.fontSizeSmall')}</SelectItem>
                  <SelectItem value="medium">{t('videoProcessing.fontSizeMedium')}</SelectItem>
                  <SelectItem value="large">{t('videoProcessing.fontSizeLarge')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('videoProcessing.watermarkOpacity')}</Label>
                <span className="text-xs text-muted-foreground">{defaultWatermarkOpacity}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={defaultWatermarkOpacity}
                onChange={(e) => setDefaultWatermarkOpacity(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('videoProcessing.opacitySubtle')}</span>
                <span>{t('videoProcessing.opacityBold')}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </CollapsibleSection>
  )
}
