'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { useViewportClamp } from '@/hooks/useViewportClamp'
import type { SortKey } from '@/lib/projects-filter'

interface ProjectsSortMenuProps {
  value: SortKey
  onChange: (value: SortKey) => void
}

const SORT_OPTIONS: SortKey[] = [
  'updatedDesc',
  'createdDesc',
  'createdAsc',
  'dueAsc',
  'titleAsc',
  'titleDesc',
  'statusPriority',
]

export default function ProjectsSortMenu({ value, onChange }: ProjectsSortMenuProps) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  useViewportClamp(popupRef, isOpen)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const labelFor = (k: SortKey) => t(`sortOption.${k}` as const)

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        title={tc('sort')}
      >
        <ArrowUpDown className="w-4 h-4" />
        <span className="hidden sm:inline ml-2">{labelFor(value)}</span>
      </Button>

      {isOpen && (
        <div
          ref={popupRef}
          className="absolute right-0 top-full mt-1 z-50 w-[200px] max-w-[calc(100vw-1rem)] bg-card border border-border rounded-lg shadow-lg p-2"
        >
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
            {tc('sort')}
          </div>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setIsOpen(false) }}
              className="flex items-center gap-2 w-full px-2 py-1 hover:bg-muted rounded text-left"
            >
              <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                {opt === value && <Check className="w-3.5 h-3.5 text-primary" />}
              </span>
              <span className="text-xs truncate">{labelFor(opt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
