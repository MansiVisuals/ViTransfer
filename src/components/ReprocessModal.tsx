'use client'

import { Button } from './ui/button'

interface ReprocessModalProps {
  show: boolean
  onCancel: () => void
  onSaveWithoutReprocess: () => void
  onSaveAndReprocess: () => void
  saving: boolean
  reprocessing: boolean
  title?: string
  description?: string
  isSingleVideo?: boolean
}

export function ReprocessModal({
  show,
  onCancel,
  onSaveWithoutReprocess,
  onSaveAndReprocess,
  saving,
  reprocessing,
  title = 'Video Processing Settings Changed',
  description = "You've changed settings that affect how videos are processed. These changes will only apply to newly uploaded videos.",
  isSingleVideo = false
}: ReprocessModalProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg max-w-lg w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="text-warning text-2xl">⚠️</div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-2">
              {description}
            </p>
          </div>
        </div>

        <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2 text-sm">
          <p className="font-semibold">
            Would you like to reprocess {isSingleVideo ? 'this video' : 'existing videos'}?
          </p>
          <ul className="space-y-1 ml-4 list-disc text-muted-foreground">
            <li>{isSingleVideo ? 'Video' : 'All existing videos'} will be regenerated with new settings</li>
            <li>Old preview files will be deleted (originals are kept safe)</li>
            <li>{isSingleVideo ? 'Video' : 'Videos'} will be temporarily unavailable during processing</li>
            {!isSingleVideo && <li>This uses server CPU and storage resources</li>}
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1"
            disabled={saving || reprocessing}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onSaveWithoutReprocess}
            className="flex-1"
            disabled={saving || reprocessing}
          >
            {saving ? 'Saving...' : 'Save Without Reprocessing'}
          </Button>
          <Button
            variant="default"
            onClick={onSaveAndReprocess}
            className="flex-1"
            disabled={saving || reprocessing}
          >
            {reprocessing ? 'Reprocessing...' : 'Save & Reprocess'}
          </Button>
        </div>
      </div>
    </div>
  )
}
