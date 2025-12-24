'use client'

import { Button } from './ui/button'
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
  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg max-w-lg w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-warning flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-xl font-bold">Unapprove Project</h2>
            <p className="text-sm text-muted-foreground mt-2">
              You are about to change the project status from APPROVED back to IN REVIEW.
            </p>
          </div>
        </div>

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

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1"
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onUnapproveProjectOnly}
            className="flex-1"
            disabled={processing}
          >
            {processing ? 'Processing...' : 'Project Only'}
          </Button>
          <Button
            variant="destructive"
            onClick={onUnapproveAll}
            className="flex-1"
            disabled={processing}
          >
            {processing ? 'Processing...' : 'Unapprove All'}
          </Button>
        </div>
      </div>
    </div>
  )
}
