'use client'

import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useTranslations } from 'next-intl'

interface ProjectsSearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function ProjectsSearchBar({ value, onChange, placeholder }: ProjectsSearchBarProps) {
  const t = useTranslations('projects')
  return (
    <div className="relative flex-1 min-w-0 max-w-sm">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t('searchPlaceholder')}
        className="h-9 pl-8 pr-8 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={t('clearSearch')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
