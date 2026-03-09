'use client'

import { Label } from './ui/label'
import { Input } from './ui/input'
import { Zap, Clock, Calendar, CalendarDays, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

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

const SCHEDULE_OPTION_KEYS = [
  { value: 'IMMEDIATE', titleKey: 'immediate', descriptionKey: 'immediateHint', icon: Zap },
  { value: 'HOURLY', titleKey: 'hourly', descriptionKey: 'hourlyHint', icon: Clock },
  { value: 'DAILY', titleKey: 'daily', descriptionKey: 'dailyHint', icon: Calendar },
  { value: 'WEEKLY', titleKey: 'weekly', descriptionKey: 'weeklyHint', icon: CalendarDays },
]

const DAY_KEYS = [
  { value: 0, key: 'sunday', shortKey: 'sun' },
  { value: 1, key: 'monday', shortKey: 'mon' },
  { value: 2, key: 'tuesday', shortKey: 'tue' },
  { value: 3, key: 'wednesday', shortKey: 'wed' },
  { value: 4, key: 'thursday', shortKey: 'thu' },
  { value: 5, key: 'friday', shortKey: 'fri' },
  { value: 6, key: 'saturday', shortKey: 'sat' },
]

export function ScheduleSelector({
  schedule,
  time,
  day,
  onScheduleChange,
  onTimeChange,
  onDayChange,
  label,
  description,
}: ScheduleSelectorProps) {
  const t = useTranslations('settings.schedule')
  const effectiveLabel = label ?? t('title')
  const effectiveDescription = description ?? t('description')

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-1">{effectiveLabel}</h4>
        <p className="text-xs text-muted-foreground mb-4">{effectiveDescription}</p>
      </div>

      {/* Schedule Options - Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SCHEDULE_OPTION_KEYS.map((option) => {
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
                  <div className="font-semibold text-sm mb-1">{t(option.titleKey)}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    {t(option.descriptionKey)}
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
          <Label htmlFor="time" className="text-sm font-medium">{t('sendTime')}</Label>
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
            {t('sendTimeHint')}
          </p>
        </div>
      )}

      {/* Weekly Day and Time Picker */}
      {schedule === 'WEEKLY' && (
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('sendDay')}</Label>
            <div className="grid grid-cols-7 gap-2">
              {DAY_KEYS.map((d) => (
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
                  {t(d.shortKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="time" className="text-sm font-medium">{t('sendTime')}</Label>
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
              {t('sendTimeHint')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
