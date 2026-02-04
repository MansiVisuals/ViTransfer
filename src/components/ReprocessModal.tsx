'use client'

import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog'
import { AlertTriangle } from 'lucide-react'

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
  return (
    <Dialog open={show} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
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
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button variant="outline" disabled={saving || reprocessing}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="outline"
            onClick={onSaveWithoutReprocess}
            disabled={saving || reprocessing}
          >
            {saving ? 'Saving...' : 'Save Without Reprocessing'}
          </Button>
          <Button
            variant="default"
            onClick={onSaveAndReprocess}
            disabled={saving || reprocessing}
          >
            {reprocessing ? 'Reprocessing...' : 'Save & Reprocess'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
