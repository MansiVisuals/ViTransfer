'use client'

import { Label } from './ui/label'
import { Input } from './ui/input'
import { Zap, Clock, Calendar, CalendarDays, Check } from 'lucide-react'

interface ScheduleSelectorProps {
  schedule: string
  time: string
  day: number
  onScheduleChange: (schedule: string) => void
  onTimeChange: (time: string) => void
  onDayChange: (day: number) => void
  label?: string
  description?: string
}

const scheduleOptions = [
  {
    value: 'IMMEDIATE',
    title: 'Immediate',
    description: 'Send instantly when activity occurs',
    icon: Zap
  },
  {
    value: 'HOURLY',
    title: 'Hourly',
    description: 'Every hour at :00 (10:00, 11:00, etc.). Approvals are always sent immediately.',
    icon: Clock
  },
  {
    value: 'DAILY',
    title: 'Daily',
    description: 'Once per day at your chosen time. Approvals are always sent immediately.',
    icon: Calendar
  },
  {
    value: 'WEEKLY',
    title: 'Weekly',
    description: 'Once per week on your chosen day. Approvals are always sent immediately.',
    icon: CalendarDays
  }
]

const daysOfWeek = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
]

export function ScheduleSelector({
  schedule,
  time,
  day,
  onScheduleChange,
  onTimeChange,
  onDayChange,
  label = "Notification Schedule",
  description = "Configure when to receive email notifications"
}: ScheduleSelectorProps) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-1">{label}</h4>
        <p className="text-xs text-muted-foreground mb-4">{description}</p>
      </div>

      {/* Schedule Options - Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {scheduleOptions.map((option) => {
          const IconComponent = option.icon
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onScheduleChange(option.value)}
              className={`
                relative p-4 rounded-lg border-2 text-left transition-all
                ${schedule === option.value
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-card hover:border-primary/50 hover:bg-accent/50'
                }
              `}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${schedule === option.value ? 'text-primary' : 'text-muted-foreground'}`}>
                  <IconComponent className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm mb-1">{option.title}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    {option.description}
                  </div>
                </div>
                {schedule === option.value && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Daily Time Picker */}
      {schedule === 'DAILY' && (
        <div className="space-y-2 pt-2">
          <Label htmlFor="time" className="text-sm font-medium">Send time</Label>
          <Input
            type="text"
            id="time"
            value={time}
            onChange={(e) => {
              const value = e.target.value
              if (value === '' || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                onTimeChange(value)
              } else if (/^([0-1]?[0-9]|2[0-3]):?[0-5]?[0-9]?$/.test(value)) {
                onTimeChange(value)
              }
            }}
            onBlur={(e) => {
              const value = e.target.value
              if (value && !value.includes(':')) {
                if (value.length === 1 || value.length === 2) {
                  onTimeChange(value.padStart(2, '0') + ':00')
                }
              } else if (value && value.split(':')[1]?.length === 1) {
                const [h, m] = value.split(':')
                onTimeChange(h.padStart(2, '0') + ':' + m + '0')
              }
            }}
            placeholder="16:00"
            maxLength={5}
            className="font-mono text-base"
          />
          <p className="text-xs text-muted-foreground">
            24-hour format (e.g., 09:00, 16:00, 18:30)
          </p>
        </div>
      )}

      {/* Weekly Day and Time Picker */}
      {schedule === 'WEEKLY' && (
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Send day</Label>
            <div className="grid grid-cols-7 gap-2">
              {daysOfWeek.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onDayChange(d.value)}
                  className={`
                    px-2 py-2 rounded-md text-xs font-medium transition-all
                    ${day === d.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }
                  `}
                >
                  {d.label.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="time" className="text-sm font-medium">Send time</Label>
            <Input
              type="text"
              id="time"
              value={time}
              onChange={(e) => {
                const value = e.target.value
                if (value === '' || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
                  onTimeChange(value)
                } else if (/^([0-1]?[0-9]|2[0-3]):?[0-5]?[0-9]?$/.test(value)) {
                  onTimeChange(value)
                }
              }}
              onBlur={(e) => {
                const value = e.target.value
                if (value && !value.includes(':')) {
                  if (value.length === 1 || value.length === 2) {
                    onTimeChange(value.padStart(2, '0') + ':00')
                  }
                } else if (value && value.split(':')[1]?.length === 1) {
                  const [h, m] = value.split(':')
                  onTimeChange(h.padStart(2, '0') + ':' + m + '0')
                }
              }}
              placeholder="16:00"
              maxLength={5}
              className="font-mono text-base"
            />
            <p className="text-xs text-muted-foreground">
              24-hour format (e.g., 09:00, 16:00, 18:30)
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
