'use client'

import { useTranslations } from 'next-intl'
import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ShareViewMode = 'grid' | 'list'

export const SHARE_VIEW_STORAGE_KEY = 'vitransfer-share-video-view'

export function loadShareViewMode(): ShareViewMode {
  try {
    const stored = localStorage.getItem(SHARE_VIEW_STORAGE_KEY)
    if (stored === 'list' || stored === 'grid') return stored
  } catch {}
  return 'grid'
}

/** Page-level grid/list switch for the share overview (videos + photo albums) */
export default function ShareViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: ShareViewMode
  onChange: (mode: ShareViewMode) => void
}) {
  const t = useTranslations('share')

  const change = (mode: ShareViewMode) => {
    onChange(mode)
    try { localStorage.setItem(SHARE_VIEW_STORAGE_KEY, mode) } catch {}
  }

  return (
    <div className="flex items-center h-9 rounded-lg border border-border overflow-hidden" data-tutorial="view-toggle">
      <button
        type="button"
        onClick={() => change('grid')}
        className={cn('h-full px-2.5 flex items-center transition-colors', viewMode === 'grid' ? 'bg-accent text-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
        title={t('gridView')}
        aria-label={t('gridView')}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => change('list')}
        className={cn('h-full px-2.5 flex items-center transition-colors', viewMode === 'list' ? 'bg-accent text-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
        title={t('listView')}
        aria-label={t('listView')}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  )
}
