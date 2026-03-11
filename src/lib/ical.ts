interface CalendarProject {
  id: string
  title: string
  dueDate: Date
  status: string
  updatedAt: Date
}

export function generateICalFeed(projects: CalendarProject[], domain: string): string {
  const host = domain.replace(/^https?:\/\//, '')

  const events = projects.map(project => {
    const date = new Date(project.dueDate)
    const dtstart = formatICalDate(date)
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    const dtend = formatICalDate(nextDay)
    const dtstamp = formatICalDateTime(new Date(project.updatedAt))
    const lastModified = dtstamp

    const summary = project.status === 'APPROVED'
      ? `✓ ${project.title}`
      : project.status === 'ARCHIVED'
        ? `✗ ${project.title}`
        : project.title

    return [
      'BEGIN:VEVENT',
      `UID:${project.id}@${host}`,
      `DTSTAMP:${dtstamp}`,
      `LAST-MODIFIED:${lastModified}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${escapeICalText(summary)}`,
      `URL:${domain}/admin/projects/${project.id}`,
      `STATUS:CONFIRMED`,
      'END:VEVENT',
    ].join('\r\n')
  })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ViTransfer//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ViTransfer Deadlines',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}

function formatICalDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function formatICalDateTime(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  const s = String(date.getUTCSeconds()).padStart(2, '0')
  return `${y}${m}${d}T${h}${min}${s}Z`
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}
