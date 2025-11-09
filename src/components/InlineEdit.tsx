import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, X } from 'lucide-react'

interface InlineEditProps {
  value: string
  onSave: () => void
  onCancel: () => void
  onChange: (value: string) => void
  disabled?: boolean
  inputClassName?: string
  stopPropagation?: boolean
}

export function InlineEdit({
  value,
  onSave,
  onCancel,
  onChange,
  disabled = false,
  inputClassName = 'h-8 w-48',
  stopPropagation = false
}: InlineEditProps) {
  const handleContainerClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSave()
    if (e.key === 'Escape') onCancel()
    if (stopPropagation) {
      e.stopPropagation()
    }
  }

  return (
    <div className="flex items-center gap-2" onClick={handleContainerClick}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
        autoFocus
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-success hover:text-success hover:bg-success-visible"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation()
          onSave()
        }}
        disabled={disabled}
        title="Save"
      >
        <Check className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive-visible"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation()
          onCancel()
        }}
        disabled={disabled}
        title="Cancel"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  )
}
