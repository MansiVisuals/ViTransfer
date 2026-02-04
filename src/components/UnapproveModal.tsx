'use client'

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
  return (
    <Dialog open={show} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Unapprove Project
          </DialogTitle>
          <DialogDescription>
            You are about to change the project status from APPROVED back to IN REVIEW.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2 text-sm">
            <p className="font-semibold">
              What would you like to do with the approved videos?
            </p>
            <ul className="space-y-1 ml-4 list-disc text-muted-foreground">
              <li><strong>Unapprove All:</strong> Unapprove the project AND all approved videos (removes access to original quality downloads)</li>
              <li><strong>Project Only:</strong> Only change project status, keep videos approved (clients retain original quality access)</li>
            </ul>
          </div>

          <div className="bg-accent/50 border border-border rounded-lg p-3 text-xs text-muted-foreground">
            <strong>Tip:</strong> Use &quot;Project Only&quot; if you need to make changes to the project without affecting client access to approved videos.
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button variant="outline" disabled={processing}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="outline"
            onClick={onUnapproveProjectOnly}
            disabled={processing}
          >
            {processing ? 'Processing...' : 'Project Only'}
          </Button>
          <Button
            variant="destructive"
            onClick={onUnapproveAll}
            disabled={processing}
          >
            {processing ? 'Processing...' : 'Unapprove All'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
