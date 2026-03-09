'use client'

import { useTranslations } from 'next-intl'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog'
import { AlertTriangle } from 'lucide-react'

interface UnapproveModalProps {
  show: boolean
  onCancel: () => void
  onUnapproveProjectOnly: () => void
  onUnapproveAll: () => void
  processing: boolean
}

export function UnapproveModal({
  show,
  onCancel,
  onUnapproveProjectOnly,
  onUnapproveAll,
  processing,
}: UnapproveModalProps) {
  const t = useTranslations('unapprove')
  const tc = useTranslations('common')
  return (
    <Dialog open={show} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2 text-sm">
            <p className="font-semibold">
              {t('whatToDo')}
            </p>
            <ul className="space-y-1 ml-4 list-disc text-muted-foreground">
              <li><strong>{t('unapproveAll')}</strong> {t('unapproveAllDescription')}</li>
              <li><strong>{t('projectOnly')}</strong> {t('projectOnlyDescription')}</li>
            </ul>
          </div>

          <div className="bg-accent/50 border border-border rounded-lg p-3 text-xs text-muted-foreground">
            <strong>{t('tip')}</strong> {t('tipUse')} &quot;{t('projectOnlyButton')}&quot; {t('tipDescription')}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button variant="outline" disabled={processing}>
              {tc('cancel')}
            </Button>
          </DialogClose>
          <Button
            variant="outline"
            onClick={onUnapproveProjectOnly}
            disabled={processing}
          >
            {processing ? t('processing') : t('projectOnlyButton')}
          </Button>
          <Button
            variant="destructive"
            onClick={onUnapproveAll}
            disabled={processing}
          >
            {processing ? t('processing') : t('unapproveAllButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
