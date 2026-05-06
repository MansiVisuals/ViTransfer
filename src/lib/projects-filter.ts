/**
 * Pure filter/sort/derive logic for the admin Projects Dashboard.
 * Kept out of components so it can be reasoned about and tested in isolation.
 */

export type DueBucket = 'overdue' | 'thisWeek' | 'thisMonth' | 'later' | 'none'

export type SortKey =
  | 'updatedDesc'
  | 'createdDesc'
  | 'createdAsc'
  | 'dueAsc'
  | 'titleAsc'
  | 'titleDesc'
  | 'statusPriority'

export interface ProjectListItem {
  id: string
  title: string
  description?: string | null
  status: string
  companyName: string | null
  clientCompanyId?: string | null
  clientCompany?: { name: string } | null
  createdAt: string | Date
  updatedAt: string | Date
  dueDate: string | null
  videos: { id: string; status: string }[]
  recipients: { id: string; name: string | null; email?: string | null; isPrimary: boolean }[]
  _count: { videos?: number; comments: number }
}

export interface ProjectsFilterState {
  q: string
  statuses: Set<string>
  clientKeys: Set<string>
  years: Set<string>
  dueBuckets: Set<DueBucket>
  sort: SortKey
}

export const NO_CLIENT_KEY = '__no_client__'

export function clientKeyFor(p: ProjectListItem): string {
  if (p.clientCompanyId) return `cc:${p.clientCompanyId}`
  const name = p.companyName?.trim()
  if (name) return `txt:${name.toLowerCase()}`
  return NO_CLIENT_KEY
}

export function clientLabelFor(p: ProjectListItem): string | null {
  return p.clientCompany?.name || p.companyName || null
}

export function yearFor(p: ProjectListItem): string {
  return new Date(p.createdAt).getFullYear().toString()
}

export function dueBucketFor(p: ProjectListItem, now: Date = new Date()): DueBucket {
  if (!p.dueDate) return 'none'
  // Completed-ish projects never count as overdue (matches existing UI semantics)
  const isCompleted = p.status === 'APPROVED' || p.status === 'ARCHIVED' || p.status === 'SHARE_ONLY'

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const due = new Date(p.dueDate)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) return isCompleted ? 'later' : 'overdue'
  if (diffDays <= 7) return 'thisWeek'
  if (diffDays <= 30) return 'thisMonth'
  return 'later'
}

export function matchesSearch(p: ProjectListItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (p.title?.toLowerCase().includes(q)) return true
  if (p.description?.toLowerCase().includes(q)) return true
  if (p.companyName?.toLowerCase().includes(q)) return true
  if (p.clientCompany?.name.toLowerCase().includes(q)) return true
  for (const r of p.recipients || []) {
    if (r.name?.toLowerCase().includes(q)) return true
    if (r.email?.toLowerCase().includes(q)) return true
  }
  return false
}

export function matchesFilters(p: ProjectListItem, f: ProjectsFilterState): boolean {
  if (f.statuses.size > 0 && !f.statuses.has(p.status)) return false
  if (f.clientKeys.size > 0 && !f.clientKeys.has(clientKeyFor(p))) return false
  if (f.years.size > 0 && !f.years.has(yearFor(p))) return false
  if (f.dueBuckets.size > 0 && !f.dueBuckets.has(dueBucketFor(p))) return false
  return true
}

export function applyProjectsQuery(projects: ProjectListItem[], f: ProjectsFilterState): ProjectListItem[] {
  const filtered = projects.filter(p => matchesFilters(p, f) && matchesSearch(p, f.q))
  return sortProjects(filtered, f.sort)
}

const STATUS_PRIORITY: Record<string, number> = {
  IN_REVIEW: 1,
  SHARE_ONLY: 2,
  APPROVED: 3,
  ARCHIVED: 4,
}

export function sortProjects(list: ProjectListItem[], sort: SortKey): ProjectListItem[] {
  const sorted = [...list]
  const ts = (d: string | Date) => new Date(d).getTime()
  switch (sort) {
    case 'updatedDesc':
      return sorted.sort((a, b) => ts(b.updatedAt) - ts(a.updatedAt))
    case 'createdDesc':
      return sorted.sort((a, b) => ts(b.createdAt) - ts(a.createdAt))
    case 'createdAsc':
      return sorted.sort((a, b) => ts(a.createdAt) - ts(b.createdAt))
    case 'dueAsc':
      return sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title)
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return ts(a.dueDate) - ts(b.dueDate)
      })
    case 'titleAsc':
      return sorted.sort((a, b) => a.title.localeCompare(b.title))
    case 'titleDesc':
      return sorted.sort((a, b) => b.title.localeCompare(a.title))
    case 'statusPriority':
      return sorted.sort((a, b) => {
        const diff = (STATUS_PRIORITY[a.status] || 99) - (STATUS_PRIORITY[b.status] || 99)
        if (diff !== 0) return diff
        return ts(b.updatedAt) - ts(a.updatedAt)
      })
  }
}

export interface ClientOption {
  key: string
  label: string
  count: number
}

export function getDistinctClients(projects: ProjectListItem[]): ClientOption[] {
  const map = new Map<string, ClientOption>()
  for (const p of projects) {
    const key = clientKeyFor(p)
    const label = clientLabelFor(p)
    if (!label && key !== NO_CLIENT_KEY) continue
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
    } else {
      map.set(key, { key, label: label || '', count: 1 })
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.key === NO_CLIENT_KEY) return 1
    if (b.key === NO_CLIENT_KEY) return -1
    return a.label.localeCompare(b.label)
  })
}

export function getDistinctYears(projects: ProjectListItem[]): string[] {
  const set = new Set<string>()
  for (const p of projects) set.add(yearFor(p))
  return Array.from(set).sort((a, b) => Number(b) - Number(a))
}

export const DUE_BUCKETS: DueBucket[] = ['overdue', 'thisWeek', 'thisMonth', 'later', 'none']

export function emptyFilterState(): ProjectsFilterState {
  return {
    q: '',
    statuses: new Set(),
    clientKeys: new Set(),
    years: new Set(),
    dueBuckets: new Set(),
    sort: 'updatedDesc',
  }
}

export function isFilterActive(f: ProjectsFilterState): boolean {
  return f.q.trim().length > 0
    || f.statuses.size > 0
    || f.clientKeys.size > 0
    || f.years.size > 0
    || f.dueBuckets.size > 0
}

/**
 * Serialize filter state to URL search params (for shareable URLs).
 * Sets are joined with commas; empty fields are omitted.
 */
export function filterStateToParams(f: ProjectsFilterState): URLSearchParams {
  const params = new URLSearchParams()
  if (f.q.trim()) params.set('q', f.q.trim())
  if (f.statuses.size) params.set('status', Array.from(f.statuses).join(','))
  if (f.clientKeys.size) params.set('client', Array.from(f.clientKeys).join(','))
  if (f.years.size) params.set('year', Array.from(f.years).join(','))
  if (f.dueBuckets.size) params.set('due', Array.from(f.dueBuckets).join(','))
  if (f.sort !== 'updatedDesc') params.set('sort', f.sort)
  return params
}

export function filterStateFromParams(params: URLSearchParams): ProjectsFilterState {
  const splitSet = (key: string) => {
    const v = params.get(key)
    return new Set(v ? v.split(',').filter(Boolean) : [])
  }
  const sort = (params.get('sort') as SortKey) || 'updatedDesc'
  return {
    q: params.get('q') || '',
    statuses: splitSet('status'),
    clientKeys: splitSet('client'),
    years: splitSet('year'),
    dueBuckets: splitSet('due') as Set<DueBucket>,
    sort,
  }
}

/** Stable JSON shape for storage, preserving Set ordering as arrays. */
export interface SerializedFilterState {
  q: string
  statuses: string[]
  clientKeys: string[]
  years: string[]
  dueBuckets: DueBucket[]
  sort: SortKey
}

export function serializeFilterState(f: ProjectsFilterState): SerializedFilterState {
  return {
    q: f.q,
    statuses: Array.from(f.statuses),
    clientKeys: Array.from(f.clientKeys),
    years: Array.from(f.years),
    dueBuckets: Array.from(f.dueBuckets),
    sort: f.sort,
  }
}

export function deserializeFilterState(s: SerializedFilterState): ProjectsFilterState {
  return {
    q: s.q || '',
    statuses: new Set(s.statuses || []),
    clientKeys: new Set(s.clientKeys || []),
    years: new Set(s.years || []),
    dueBuckets: new Set(s.dueBuckets || []),
    sort: s.sort || 'updatedDesc',
  }
}

function arrayEqualUnordered<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  const aa = a || []
  const bb = b || []
  if (aa.length !== bb.length) return false
  const sa = [...aa].sort()
  const sb = [...bb].sort()
  return sa.every((v, i) => v === sb[i])
}

/**
 * Order-independent deep equality on SerializedFilterState.
 * Necessary because PostgreSQL JSONB does not preserve object key or array
 * order, so a JSON.stringify compare against DB-roundtripped data is unreliable.
 */
export function serializedStatesEqual(a: SerializedFilterState, b: SerializedFilterState): boolean {
  return a.q === b.q
    && a.sort === b.sort
    && arrayEqualUnordered(a.statuses, b.statuses)
    && arrayEqualUnordered(a.clientKeys, b.clientKeys)
    && arrayEqualUnordered(a.years, b.years)
    && arrayEqualUnordered(a.dueBuckets, b.dueBuckets)
}
