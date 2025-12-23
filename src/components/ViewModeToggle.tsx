'use client'

import { cn } from '@/lib/utils'
import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ViewMode = 'grid' | 'list'

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (value: ViewMode) => void
  className?: string
}

export default function ViewModeToggle({ value, onChange, className }: ViewModeToggleProps) {
  return (
    <div className={cn('inline-flex items-center rounded-md border bg-card p-0.5', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onChange('grid')}
        aria-pressed={value === 'grid'}
        className={cn(
          'h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground',
          value === 'grid' && 'bg-accent text-foreground'
        )}
        title="Grid view"
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="sr-only">Grid view</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        className={cn(
          'h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground',
          value === 'list' && 'bg-accent text-foreground'
        )}
        title="List view"
      >
        <List className="h-4 w-4" />
        <span className="sr-only">List view</span>
      </Button>
    </div>
  )
}

