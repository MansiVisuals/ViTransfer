import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { Monitor, Moon, Sun, Check, Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'

const SUPPORTED_LANGUAGES = [
  { code: 'en' },
  { code: 'nl' },
  { code: 'de' },
] as const

// Accent color presets with HSL values for light and dark modes
export const ACCENT_COLORS = {
  blue: { name: 'Blue', light: '211 100% 50%', dark: '209 100% 60%', hex: '#007AFF' },
  purple: { name: 'Purple', light: '262 83% 58%', dark: '262 83% 68%', hex: '#8B5CF6' },
  green: { name: 'Green', light: '145 63% 42%', dark: '145 63% 49%', hex: '#22C55E' },
  orange: { name: 'Orange', light: '25 95% 53%', dark: '25 95% 60%', hex: '#F97316' },
  red: { name: 'Red', light: '0 84% 60%', dark: '0 84% 65%', hex: '#EF4444' },
  pink: { name: 'Pink', light: '330 81% 60%', dark: '330 81% 65%', hex: '#EC4899' },
  teal: { name: 'Teal', light: '173 80% 40%', dark: '173 80% 50%', hex: '#14B8A6' },
  amber: { name: 'Amber', light: '38 92% 50%', dark: '38 92% 55%', hex: '#F59E0B' },
  stone: { name: 'Stone', light: '30 12% 50%', dark: '30 12% 62%', hex: '#9d9487' },
  gold: { name: 'Gold', light: '37 56% 65%', dark: '37 56% 72%', hex: '#DEC091' },
} as const

export type AccentColorKey = keyof typeof ACCENT_COLORS

interface AppearanceSectionProps {
  language: string
  setLanguage: (value: string) => void
  defaultTheme: string
  setDefaultTheme: (value: string) => void
  accentColor: string
  setAccentColor: (value: string) => void
  show: boolean
  setShow: (value: boolean) => void
  collapsible?: boolean
}

export function AppearanceSection({
  language,
  setLanguage,
  defaultTheme,
  setDefaultTheme,
  accentColor,
  setAccentColor,
  show,
  setShow,
  collapsible,
}: AppearanceSectionProps) {
  const t = useTranslations('settings')
  const themeOptions = [
    { value: 'auto', label: t('appearance.auto'), icon: Monitor, description: t('appearance.autoDescription') },
    { value: 'light', label: t('appearance.light'), icon: Sun, description: t('appearance.lightDescription') },
    { value: 'dark', label: t('appearance.dark'), icon: Moon, description: t('appearance.darkDescription') },
  ]

  return (
    <CollapsibleSection
      className="border-border"
      title={t('appearance.title')}
      description={t('appearance.description')}
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
      collapsible={collapsible}
    >
      {/* Language */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          {t('language.label')}
        </Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {t(`language.${lang.code}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('language.hint')}
        </p>
      </div>

      {/* Theme Selection */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label>{t('appearance.defaultTheme')}</Label>
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map((option) => {
            const Icon = option.icon
            const isSelected = defaultTheme === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setDefaultTheme(option.value)}
                className={`flex flex-col items-center gap-1 p-2 sm:p-3 rounded-lg border-2 transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-xs sm:text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {option.label}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('appearance.themeToggleHint')}
        </p>
      </div>

      {/* Accent Color Selection */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label>{t('appearance.accentColor')}</Label>
        <div className="flex flex-wrap gap-3">
          {Object.entries(ACCENT_COLORS).map(([key, color]) => {
            const isSelected = accentColor === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setAccentColor(key)}
                className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-foreground'
                    : 'border-transparent hover:border-border'
                }`}
                title={color.name}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ backgroundColor: color.hex }}
                >
                  {isSelected && <Check className="w-5 h-5 text-white" />}
                </div>
                <span className="text-xs text-muted-foreground">{t(`appearance.${key}` as any)}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('appearance.accentColorHint')}
        </p>
      </div>
    </CollapsibleSection>
  )
}
