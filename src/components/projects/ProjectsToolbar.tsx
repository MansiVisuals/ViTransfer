'use client'

import { useTranslations } from 'next-intl'
import FilterDropdown from '@/components/FilterDropdown'
import ViewModeToggle, { type ViewMode } from '@/components/ViewModeToggle'
import ProjectsSearchBar from './ProjectsSearchBar'
import ProjectsSortMenu from './ProjectsSortMenu'
import type { ClientOption, DueBucket, ProjectsFilterState } from '@/lib/projects-filter'
import { DUE_BUCKETS, NO_CLIENT_KEY } from '@/lib/projects-filter'

const STATUS_OPTIONS = ['IN_REVIEW', 'APPROVED', 'SHARE_ONLY', 'ARCHIVED'] as const

interface ProjectsToolbarProps {
  filters: ProjectsFilterState
  onChange: (filters: ProjectsFilterState) => void
  clientOptions: ClientOption[]
  yearOptions: string[]
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export default function ProjectsToolbar({
  filters,
  onChange,
  clientOptions,
  yearOptions,
  viewMode,
  onViewModeChange,
}: ProjectsToolbarProps) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')

  const setField = <K extends keyof ProjectsFilterState>(key: K, value: ProjectsFilterState[K]) => {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <ProjectsSearchBar value={filters.q} onChange={(q) => setField('q', q)} />

      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <FilterDropdown
          width="w-[260px]"
          groups={[
            {
              key: 'status',
              label: tc('status'),
              options: STATUS_OPTIONS.map(v => ({
                value: v,
                label: v === 'IN_REVIEW' ? t('statusInReview')
                  : v === 'APPROVED' ? t('statusApproved')
                  : v === 'SHARE_ONLY' ? t('statusShareOnly')
                  : t('statusArchived'),
              })),
              selected: filters.statuses,
              onChange: (s) => setField('statuses', s),
            },
            {
              key: 'client',
              label: t('client'),
              options: clientOptions.map(c => ({
                value: c.key,
                label: c.key === NO_CLIENT_KEY
                  ? `${t('noClientAssigned')} (${c.count})`
                  : `${c.label} (${c.count})`,
              })),
              selected: filters.clientKeys,
              onChange: (s) => setField('clientKeys', s),
              searchable: true,
              searchPlaceholder: t('searchClients'),
            },
            {
              key: 'year',
              label: t('year'),
              options: yearOptions.map(y => ({ value: y, label: y })),
              selected: filters.years,
              onChange: (s) => setField('years', s),
              searchable: true,
            },
            {
              key: 'due',
              label: t('dueDateLabel'),
              options: DUE_BUCKETS.map(b => ({
                value: b,
                label: t(`dueBucket.${b}` as const),
              })),
              selected: filters.dueBuckets as Set<string>,
              onChange: (s) => setField('dueBuckets', s as Set<DueBucket>),
            },
          ]}
        />

        <ProjectsSortMenu value={filters.sort} onChange={(sort) => setField('sort', sort)} />

        <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
      </div>
    </div>
  )
}
