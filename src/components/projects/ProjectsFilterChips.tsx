'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import type { DueBucket, ProjectsFilterState } from '@/lib/projects-filter'
import { NO_CLIENT_KEY } from '@/lib/projects-filter'

interface ProjectsFilterChipsProps {
  filters: ProjectsFilterState
  onChange: (filters: ProjectsFilterState) => void
  clientLabels: Record<string, string>
  onClearAll: () => void
}

export default function ProjectsFilterChips({ filters, onChange, clientLabels, onClearAll }: ProjectsFilterChipsProps) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')

  const removeFromSet = <T,>(field: keyof ProjectsFilterState, set: Set<T>, value: T) => {
    const next = new Set(set)
    next.delete(value)
    onChange({ ...filters, [field]: next })
  }

  const clearQuery = () => onChange({ ...filters, q: '' })

  const statusLabels: Record<string, string> = {
    IN_REVIEW: t('statusInReview'),
    APPROVED: t('statusApproved'),
    SHARE_ONLY: t('statusShareOnly'),
    ARCHIVED: t('statusArchived'),
  }

  const dueLabels: Record<DueBucket, string> = {
    overdue: t('dueBucket.overdue'),
    thisWeek: t('dueBucket.thisWeek'),
    thisMonth: t('dueBucket.thisMonth'),
    later: t('dueBucket.later'),
    none: t('dueBucket.none'),
  }

  const chips: { id: string; group: string; label: string; onRemove: () => void }[] = []

  if (filters.q.trim()) {
    chips.push({
      id: `q:${filters.q}`,
      group: tc('search'),
      label: filters.q.trim(),
      onRemove: clearQuery,
    })
  }
  for (const s of filters.statuses) {
    chips.push({
      id: `status:${s}`,
      group: tc('status'),
      label: statusLabels[s] || s,
      onRemove: () => removeFromSet('statuses', filters.statuses, s),
    })
  }
  for (const k of filters.clientKeys) {
    chips.push({
      id: `client:${k}`,
      group: t('client'),
      label: k === NO_CLIENT_KEY ? t('noClientAssigned') : (clientLabels[k] || k),
      onRemove: () => removeFromSet('clientKeys', filters.clientKeys, k),
    })
  }
  for (const y of filters.years) {
    chips.push({
      id: `year:${y}`,
      group: t('year'),
      label: y,
      onRemove: () => removeFromSet('years', filters.years, y),
    })
  }
  for (const d of filters.dueBuckets) {
    chips.push({
      id: `due:${d}`,
      group: t('dueDateLabel'),
      label: dueLabels[d],
      onRemove: () => removeFromSet('dueBuckets', filters.dueBuckets, d),
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {chips.map(chip => (
        <span
          key={chip.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-primary-visible text-primary border-2 border-primary-visible"
        >
          <span className="text-muted-foreground/80">{chip.group}:</span>
          <span className="font-medium">{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            className="ml-0.5 -mr-0.5 hover:bg-primary/15 rounded-full p-0.5"
            aria-label={t('removeFilter')}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 px-2 text-xs">
          {t('clearAllFilters')}
        </Button>
      )}
    </div>
  )
}
