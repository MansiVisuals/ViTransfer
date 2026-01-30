'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Funnel } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterOption {
  value: string
  label: string
}

interface FilterGroup {
  key: string
  label: string
  options: FilterOption[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
}

interface FilterDropdownProps {
  groups: FilterGroup[]
}

export default function FilterDropdown({ groups }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const isFiltering = groups.some(g => {
    // Check if filtering is active (not all options selected)
    return g.options.length > 0 && g.selected.size > 0 && g.selected.size < g.options.length
  })

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          isFiltering && 'text-primary border-primary'
        )}
        title="Filter"
      >
        <Funnel className={cn('w-4 h-4', isFiltering && 'fill-primary')} />
        <span className="hidden sm:inline ml-2">Filter</span>
        {isFiltering && (
          <span className="ml-1 px-1.5 py-0.5 bg-primary text-primary-foreground text-xs rounded-full font-medium">
            {groups.reduce((sum, g) => sum + g.selected.size, 0)}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-[200px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-card border border-border rounded-lg shadow-lg p-2">
          {groups.map((group, index) => {
            const allSelected = group.options.length > 0 && group.selected.size === group.options.length

            const toggleAll = () => {
              if (allSelected) {
                group.onChange(new Set())
              } else {
                group.onChange(new Set(group.options.map(o => o.value)))
              }
            }

            const toggleOption = (value: string) => {
              const newSelected = new Set(group.selected)
              if (newSelected.has(value)) {
                newSelected.delete(value)
              } else {
                newSelected.add(value)
              }
              group.onChange(newSelected)
            }

            if (group.options.length === 0) return null

            return (
              <div key={group.key}>
                {index > 0 && <div className="border-t border-border my-2" />}

                <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>{group.label}</span>
                  <span className="text-muted-foreground/70">
                    {group.selected.size}/{group.options.length}
                  </span>
                </div>

                <label className="flex items-center gap-2 px-2 py-1 hover:bg-muted rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-xs font-medium">All</span>
                </label>

                {group.options.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-muted rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={group.selected.has(option.value)}
                      onChange={() => toggleOption(option.value)}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-xs">{option.label}</span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
