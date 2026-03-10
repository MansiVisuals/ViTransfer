'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Calendar, ChevronLeft, ChevronRight, Copy, RefreshCw, BarChart3, Check, Link2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import Link from 'next/link'

interface CalendarProject {
  id: string
  title: string
  slug: string
  status: string
  dueDate: string
  createdAt: string
}

type ViewMode = 'calendar' | 'gantt'
type CalendarScale = 'day' | 'week' | 'month' | 'year'
type GanttRange = 'all' | '1m' | '3m' | '6m' | '1y'

export default function CalendarPage() {
  const t = useTranslations('calendar')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [projects, setProjects] = useState<CalendarProject[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [calendarScale, setCalendarScale] = useState<CalendarScale>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [ganttRange, setGanttRange] = useState<GanttRange>('all')
  const [ganttCenter, setGanttCenter] = useState(new Date())
  const [feedUrl, setFeedUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const fetchProjects = useCallback(async () => {
    try {
      const response = await apiFetch('/api/calendar')
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects || [])
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchFeedUrl = useCallback(async () => {
    try {
      const response = await apiFetch('/api/calendar/token')
      if (response.ok) {
        const data = await response.json()
        setFeedUrl(data.feedUrl || '')
      }
    } catch {
      // Silently fail
    }
  }, [])

  useEffect(() => {
    fetchProjects()
    fetchFeedUrl()
  }, [fetchProjects, fetchFeedUrl])

  async function regenerateFeedUrl() {
    setRegenerating(true)
    try {
      const response = await apiFetch('/api/calendar/token', { method: 'DELETE' })
      if (response.ok) {
        const data = await response.json()
        setFeedUrl(data.feedUrl || '')
      }
    } catch {
      // Silently fail
    } finally {
      setRegenerating(false)
    }
  }

  function copyFeedUrl() {
    navigator.clipboard.writeText(feedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Shared helpers
  function getStatusColor(status: string): string {
    switch (status) {
      case 'IN_REVIEW': return 'bg-blue-500'
      case 'APPROVED': return 'bg-green-500'
      case 'SHARE_ONLY': return 'bg-purple-500'
      case 'ARCHIVED': return 'bg-gray-400'
      default: return 'bg-blue-500'
    }
  }

  function getProjectsForDate(date: Date): CalendarProject[] {
    return projects.filter(p => {
      const due = new Date(p.dueDate)
      return due.getFullYear() === date.getFullYear() && due.getMonth() === date.getMonth() && due.getDate() === date.getDate()
    })
  }

  function isToday(date: Date): boolean {
    const now = new Date()
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  }

  function isSameMonth(date: Date, ref: Date): boolean {
    return date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth()
  }

  // Navigation
  function navigatePrev() {
    const d = new Date(currentDate)
    if (calendarScale === 'day') d.setDate(d.getDate() - 1)
    else if (calendarScale === 'week') d.setDate(d.getDate() - 7)
    else if (calendarScale === 'month') d.setMonth(d.getMonth() - 1)
    else d.setFullYear(d.getFullYear() - 1)
    setCurrentDate(d)
  }

  function navigateNext() {
    const d = new Date(currentDate)
    if (calendarScale === 'day') d.setDate(d.getDate() + 1)
    else if (calendarScale === 'week') d.setDate(d.getDate() + 7)
    else if (calendarScale === 'month') d.setMonth(d.getMonth() + 1)
    else d.setFullYear(d.getFullYear() + 1)
    setCurrentDate(d)
  }

  function goToToday() {
    setCurrentDate(new Date())
  }

  function getHeaderLabel(): string {
    if (calendarScale === 'day') {
      return currentDate.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
    if (calendarScale === 'week') {
      const start = getWeekStart(currentDate)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      const startStr = start.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
      const endStr = end.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
      return `${startStr} – ${endStr}`
    }
    if (calendarScale === 'year') {
      return String(currentDate.getFullYear())
    }
    return currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  }

  function getWeekStart(date: Date): Date {
    const d = new Date(date)
    d.setDate(d.getDate() - d.getDay())
    return d
  }

  // Project pill component (reused across views)
  function renderProjectPill(project: CalendarProject, size: 'sm' | 'md' = 'sm') {
    const textClass = size === 'md' ? 'text-xs' : 'text-[10px]'
    const paddingClass = size === 'md' ? 'px-2 py-1' : 'px-1 py-0.5'
    return (
      <Link
        key={project.id}
        href={`/admin/projects/${project.id}`}
        className={`block ${textClass} leading-tight ${paddingClass} rounded truncate text-white ${getStatusColor(project.status)} hover:opacity-80 transition-opacity`}
        title={project.title}
      >
        {project.title}
      </Link>
    )
  }

  // ── Day View ──
  function renderDayView() {
    const dayProjects = getProjectsForDate(currentDate)
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <Button variant="ghost" size="sm" onClick={navigatePrev}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <h2 className="text-lg font-semibold">{getHeaderLabel()}</h2>
            {isToday(currentDate) && <p className="text-xs text-primary">{t('today')}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={navigateNext}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">
          {dayProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('noProjectsDue')}</p>
          ) : (
            <div className="space-y-2">
              {dayProjects.map(project => (
                <Link
                  key={project.id}
                  href={`/admin/projects/${project.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors"
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getStatusColor(project.status)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{project.title}</p>
                    <p className="text-xs text-muted-foreground">{project.status.replace('_', ' ')}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Week View ──
  function renderWeekView() {
    const weekStart = getWeekStart(currentDate)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    })

    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <Button variant="ghost" size="sm" onClick={navigatePrev}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold">{getHeaderLabel()}</h2>
          <Button variant="ghost" size="sm" onClick={navigateNext}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayProjects = getProjectsForDate(day)
            const today = isToday(day)
            return (
              <div
                key={i}
                className={`min-h-[120px] border-r border-b border-border p-1.5 ${today ? 'bg-primary/5' : ''}`}
              >
                <div className={`text-xs mb-1 ${today ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                  <span className="block">{[t('sun'), t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat')][day.getDay()]}</span>
                  <span className="text-sm font-semibold">{day.getDate()}</span>
                </div>
                <div className="space-y-0.5">
                  {dayProjects.map(project => renderProjectPill(project))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Month View ──
  function renderMonthView() {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startOffset = firstDay.getDay()
    const daysInMonth = lastDay.getDate()

    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <Button variant="ghost" size="sm" onClick={navigatePrev}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold">{getHeaderLabel()}</h2>
          <Button variant="ghost" size="sm" onClick={navigateNext}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7">
          {[t('sun'), t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat')].map((day, i) => (
            <div key={i} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center border-b border-border">
              {day}
            </div>
          ))}

          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-border bg-muted/20" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const date = new Date(year, month, day)
            const dayProjects = getProjectsForDate(date)
            const today = isToday(date)

            return (
              <div
                key={day}
                className={`min-h-[80px] border-b border-r border-border p-1 ${today ? 'bg-primary/5' : ''}`}
              >
                <div className={`text-xs mb-1 ${today ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayProjects.map(project => renderProjectPill(project))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Year View ──
  function renderYearView() {
    const year = currentDate.getFullYear()

    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <Button variant="ghost" size="sm" onClick={navigatePrev}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold">{getHeaderLabel()}</h2>
          <Button variant="ghost" size="sm" onClick={navigateNext}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-border">
          {Array.from({ length: 12 }).map((_, monthIdx) => {
            const monthDate = new Date(year, monthIdx, 1)
            const monthLastDay = new Date(year, monthIdx + 1, 0)
            const monthStartOffset = monthDate.getDay()
            const monthDays = monthLastDay.getDate()
            const isCurrentMonth = isSameMonth(monthDate, new Date())

            return (
              <div key={monthIdx} className="bg-card p-2">
                <button
                  className={`text-xs font-semibold mb-1 hover:text-primary transition-colors ${isCurrentMonth ? 'text-primary' : 'text-foreground'}`}
                  onClick={() => { setCurrentDate(new Date(year, monthIdx, 1)); setCalendarScale('month') }}
                >
                  {monthDate.toLocaleDateString(locale, { month: 'short' })}
                </button>
                <div className="grid grid-cols-7 gap-px">
                  {/* Day headers */}
                  {[t('sun'), t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat')].map((d, i) => (
                    <div key={i} className="text-[8px] text-muted-foreground text-center">{d.charAt(0)}</div>
                  ))}
                  {/* Empty cells */}
                  {Array.from({ length: monthStartOffset }).map((_, i) => (
                    <div key={`e-${i}`} className="h-4" />
                  ))}
                  {/* Day cells */}
                  {Array.from({ length: monthDays }).map((_, i) => {
                    const dayNum = i + 1
                    const date = new Date(year, monthIdx, dayNum)
                    const dayProjects = getProjectsForDate(date)
                    const today = isToday(date)
                    const hasProjects = dayProjects.length > 0

                    return (
                      <button
                        key={dayNum}
                        className={`h-4 text-[9px] rounded-sm flex items-center justify-center relative ${
                          today ? 'bg-primary text-primary-foreground font-bold' :
                          hasProjects ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        }`}
                        onClick={() => { setCurrentDate(date); setCalendarScale('day') }}
                        title={hasProjects ? t('projectCount', { count: dayProjects.length }) : undefined}
                      >
                        {dayNum}
                        {hasProjects && !today && (
                          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Gantt helpers ──
  const allGanttProjects = projects.filter(p => p.dueDate)
  const ganttRangeMonths: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }

  // Compute viewport based on selected range
  function getGanttViewport(): { start: Date; end: Date } {
    if (ganttRange === 'all') {
      const start = allGanttProjects.length > 0
        ? new Date(Math.min(...allGanttProjects.map(p => new Date(p.createdAt).getTime())))
        : new Date()
      const end = allGanttProjects.length > 0
        ? new Date(Math.max(...allGanttProjects.map(p => new Date(p.dueDate).getTime())))
        : new Date()
      start.setDate(start.getDate() - 7)
      end.setDate(end.getDate() + 7)
      return { start, end }
    }

    const months = ganttRangeMonths[ganttRange] || 3
    const start = new Date(ganttCenter)
    start.setMonth(start.getMonth() - Math.floor(months / 2))
    start.setDate(1)
    const end = new Date(ganttCenter)
    end.setMonth(end.getMonth() + Math.ceil(months / 2))
    end.setDate(0) // last day of previous month
    return { start, end }
  }

  const { start: ganttStart, end: ganttEnd } = getGanttViewport()
  const ganttTotalDays = Math.max(1, Math.ceil((ganttEnd.getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24)))

  // Filter projects that overlap the current viewport
  const ganttProjects = allGanttProjects.filter(p => {
    if (ganttRange === 'all') return true
    const created = new Date(p.createdAt)
    const due = new Date(p.dueDate)
    return due >= ganttStart && created <= ganttEnd
  })

  function ganttBarStyle(project: CalendarProject) {
    const created = new Date(project.createdAt)
    const due = new Date(project.dueDate)
    // Clamp bar to viewport bounds
    const barStart = Math.max(created.getTime(), ganttStart.getTime())
    const barEnd = Math.min(due.getTime(), ganttEnd.getTime())
    const offset = Math.max(0, (barStart - ganttStart.getTime()) / (1000 * 60 * 60 * 24))
    const duration = Math.max(1, (barEnd - barStart) / (1000 * 60 * 60 * 24))
    const leftPercent = (offset / ganttTotalDays) * 100
    const widthPercent = (duration / ganttTotalDays) * 100
    return { left: `${leftPercent}%`, width: `${Math.max(widthPercent, 1)}%` }
  }

  function ganttTimeMarkers() {
    const markers: { label: string; leftPercent: number }[] = []
    const useWeeks = ganttRange === '1m'

    if (useWeeks) {
      // Weekly markers for 1-month range
      const current = new Date(ganttStart)
      // Advance to next Monday
      const dayOfWeek = current.getDay()
      const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek
      current.setDate(current.getDate() + daysUntilMonday)
      while (current <= ganttEnd) {
        const dayOffset = (current.getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24)
        markers.push({
          label: current.toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
          leftPercent: (dayOffset / ganttTotalDays) * 100,
        })
        current.setDate(current.getDate() + 7)
      }
    } else {
      // Monthly markers
      const current = new Date(ganttStart)
      current.setDate(1)
      if (current < ganttStart) current.setMonth(current.getMonth() + 1)
      while (current <= ganttEnd) {
        const dayOffset = (current.getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24)
        markers.push({
          label: current.toLocaleDateString(locale, { month: 'short', year: '2-digit' }),
          leftPercent: (dayOffset / ganttTotalDays) * 100,
        })
        current.setMonth(current.getMonth() + 1)
      }
    }
    return markers
  }

  function navigateGantt(direction: 'prev' | 'next') {
    const step = ganttRangeMonths[ganttRange] || 3
    const d = new Date(ganttCenter)
    d.setMonth(d.getMonth() + (direction === 'next' ? step : -step))
    setGanttCenter(d)
  }

  function getGanttHeaderLabel(): string {
    if (ganttRange === 'all') return ''
    const opts: Intl.DateTimeFormatOptions = ganttRange === '1y'
      ? { year: 'numeric' }
      : { month: 'short', year: 'numeric' }
    return `${ganttStart.toLocaleDateString(locale, opts)} – ${ganttEnd.toLocaleDateString(locale, opts)}`
  }

  const todayGanttOffset = ((new Date().getTime() - ganttStart.getTime()) / (1000 * 60 * 60 * 24) / ganttTotalDays) * 100

  // ── Render ──
  if (loading) {
    return (
      <div className="flex-1 min-h-0 bg-background">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
          <div className="flex justify-between items-center gap-4 mb-4 sm:mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                <Calendar className="w-7 h-7 sm:w-8 sm:h-8" />
                {t('title')}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t('description')}</p>
            </div>
          </div>
          <div className="text-muted-foreground">{tc('loading')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="flex justify-between items-center gap-4 mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Calendar className="w-7 h-7 sm:w-8 sm:h-8" />
              {t('title')}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">{t('description')}</p>
          </div>
          <div className="inline-flex items-center rounded-md border bg-card p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setViewMode('calendar')}
              aria-pressed={viewMode === 'calendar'}
              className={cn(
                'h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground',
                viewMode === 'calendar' && 'bg-accent text-foreground'
              )}
              title={t('calendarView')}
            >
              <Calendar className="h-4 w-4" />
              <span className="sr-only">{t('calendarView')}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setViewMode('gantt')}
              aria-pressed={viewMode === 'gantt'}
              className={cn(
                'h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground',
                viewMode === 'gantt' && 'bg-accent text-foreground'
              )}
              title={t('ganttView')}
            >
              <BarChart3 className="h-4 w-4" />
              <span className="sr-only">{t('ganttView')}</span>
            </Button>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <>
            {/* Scale toggle + Today button */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                {(['day', 'week', 'month', 'year'] as CalendarScale[]).map(scale => (
                  <button
                    key={scale}
                    onClick={() => setCalendarScale(scale)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      calendarScale === scale
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t(scale as 'day' | 'week' | 'month' | 'year')}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={goToToday}>
                {t('today')}
              </Button>
            </div>

            {calendarScale === 'day' && renderDayView()}
            {calendarScale === 'week' && renderWeekView()}
            {calendarScale === 'month' && renderMonthView()}
            {calendarScale === 'year' && renderYearView()}
          </>
        ) : (
          <>
            {/* Gantt range controls + navigation */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                {([
                  ['all', t('ganttAll')],
                  ['1m', t('gantt1Month')],
                  ['3m', t('gantt3Months')],
                  ['6m', t('gantt6Months')],
                  ['1y', t('gantt1Year')],
                ] as [GanttRange, string][]).map(([range, label]) => (
                  <button
                    key={range}
                    onClick={() => { setGanttRange(range); if (range !== 'all') setGanttCenter(new Date()) }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      ganttRange === range
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {ganttRange !== 'all' && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => navigateGantt('prev')}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[160px] text-center">{getGanttHeaderLabel()}</span>
                    <Button variant="ghost" size="sm" onClick={() => navigateGantt('next')}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => { setGanttCenter(new Date()); if (ganttRange === 'all') setGanttRange('3m') }}>
                  {t('today')}
                </Button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <div className="relative h-8 border-b border-border min-w-[800px]">
                {ganttTimeMarkers().map((marker, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-border/50 px-1 text-xs text-muted-foreground flex items-center"
                    style={{ left: `${marker.leftPercent}%` }}
                  >
                    {marker.label}
                  </div>
                ))}
              </div>

              <div className="relative min-w-[800px]">
                {todayGanttOffset >= 0 && todayGanttOffset <= 100 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
                    style={{ left: `${todayGanttOffset}%` }}
                  />
                )}

                {ganttProjects.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                    {t('noProjectsWithDueDates')}
                  </div>
                ) : (
                  ganttProjects.map(project => (
                    <div key={project.id} className="relative h-10 border-b border-border/30 flex items-center">
                      <Link
                        href={`/admin/projects/${project.id}`}
                        className={`absolute h-6 rounded ${getStatusColor(project.status)} hover:opacity-80 transition-opacity flex items-center px-2 overflow-hidden`}
                        style={ganttBarStyle(project)}
                        title={`${project.title} — Due: ${new Date(project.dueDate).toLocaleDateString()}`}
                      >
                        <span className="text-[10px] text-white truncate">{project.title}</span>
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          </>
        )}

        {/* iCal subscription */}
        <div className="mt-6 bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">{t('calendarSubscription')}</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {t('subscriptionHint')}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded truncate">
              {feedUrl || tc('loading')}
            </code>
            <Button variant="outline" size="sm" onClick={copyFeedUrl} disabled={!feedUrl}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={regenerateFeedUrl} disabled={regenerating}>
              <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
