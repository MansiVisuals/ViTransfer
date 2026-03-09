'use client'

import { useTranslations } from 'next-intl'
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
  title,
  description,
  isSingleVideo = false
}: ReprocessModalProps) {
  const t = useTranslations('reprocess')
  const tc = useTranslations('common')
  const resolvedTitle = title || t('title')
  const resolvedDescription = description || t('description')
  return (
    <Dialog open={show} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            {resolvedTitle}
          </DialogTitle>
          <DialogDescription>
            {resolvedDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2 text-sm">
            <p className="font-semibold">
              {t('wouldYouLike')} {isSingleVideo ? t('thisVideo') : t('existingVideos')}?
            </p>
            <ul className="space-y-1 ml-4 list-disc text-muted-foreground">
              <li>{isSingleVideo ? t('thisVideo') : t('allExisting')} {t('willRegenerate')}</li>
              <li>{t('originalsKeptSafe')}</li>
              <li>{isSingleVideo ? t('thisVideo') : t('existingVideos')} {t('temporarilyUnavailable')}</li>
              {!isSingleVideo && <li>{t('usesResources')}</li>}
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button variant="outline" disabled={saving || reprocessing}>
              {tc('cancel')}
            </Button>
          </DialogClose>
          <Button
            variant="outline"
            onClick={onSaveWithoutReprocess}
            disabled={saving || reprocessing}
          >
            {saving ? tc('saving') : t('saveWithout')}
          </Button>
          <Button
            variant="default"
            onClick={onSaveAndReprocess}
            disabled={saving || reprocessing}
          >
            {reprocessing ? t('reprocessing') : t('saveAndReprocess')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
