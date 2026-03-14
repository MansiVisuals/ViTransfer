import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { Monitor, Moon, Sun, Check, Upload, Trash2, Image as ImageIcon, Globe, ShieldCheck } from 'lucide-react'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { EmailTemplatesEditor } from '@/components/settings/EmailTemplatesSection'

const SUPPORTED_LANGUAGES = [
  { code: 'en' },
  { code: 'nl' },
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
  companyName: string
  setCompanyName: (value: string) => void
  appDomain: string
  setAppDomain: (value: string) => void
  brandingLogoUrl: string | null
  onUploadLogo: (file: File) => Promise<void>
  onRemoveLogo: () => Promise<void>
  logoUploading: boolean
  logoError?: string | null
  emailHeaderStyle: string
  setEmailHeaderStyle: (value: string) => void
  privacyDisclosureEnabled: boolean
  setPrivacyDisclosureEnabled: (value: boolean) => void
  privacyDisclosureText: string
  setPrivacyDisclosureText: (value: string) => void
  show: boolean
  setShow: (value: boolean) => void
}

export function AppearanceSection({
  language,
  setLanguage,
  defaultTheme,
  setDefaultTheme,
  accentColor,
  setAccentColor,
  companyName,
  setCompanyName,
  appDomain,
  setAppDomain,
  brandingLogoUrl,
  onUploadLogo,
  onRemoveLogo,
  logoUploading,
  logoError,
  emailHeaderStyle,
  setEmailHeaderStyle,
  privacyDisclosureEnabled,
  setPrivacyDisclosureEnabled,
  privacyDisclosureText,
  setPrivacyDisclosureText,
  show,
  setShow
}: AppearanceSectionProps) {
  const t = useTranslations('settings')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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
    >
      {/* Company Name */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label htmlFor="companyName">{t('appearance.companyName')}</Label>
        <Input
          id="companyName"
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder={t('appearance.companyNamePlaceholder')}
        />
        <p className="text-xs text-muted-foreground">
          {t('appearance.companyNameHint')}
        </p>
      </div>

      {/* Custom Logo Upload */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label>{t('appearance.customLogo')}</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) {
              onUploadLogo(file)
              e.target.value = ''
            }
          }}
        />
        <div className="flex items-center gap-4">
          <div className="w-24 h-16 rounded-xl border border-border bg-card flex items-center justify-center overflow-hidden">
            {brandingLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandingLogoUrl} alt={t('appearance.logoPreview')} className="w-full h-full object-contain" />
            ) : (
              <ImageIcon className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card text-sm hover:border-primary/60 hover:text-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoUploading}
            >
              <Upload className="w-4 h-4" />
              {logoUploading ? t('appearance.validating') : brandingLogoUrl ? t('appearance.replaceLogo') : t('appearance.uploadLogo')}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card text-sm text-destructive hover:border-destructive/60 hover:text-destructive transition-colors disabled:opacity-50"
              onClick={onRemoveLogo}
              disabled={!brandingLogoUrl || logoUploading}
            >
              <Trash2 className="w-4 h-4" />
              {t('appearance.removeLogo')}
            </button>
          </div>
        </div>
        {logoError ? (
          <p className="text-xs text-destructive font-medium">{logoError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('appearance.logoHint')}
          </p>
        )}
      </div>

      {/* Application Domain */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label htmlFor="appDomain">{t('appearance.appDomain')}</Label>
        <Input
          id="appDomain"
          type="text"
          value={appDomain}
          onChange={(e) => setAppDomain(e.target.value)}
          placeholder={t('appearance.appDomainPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">
          {t('appearance.appDomainHint')}
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

      {/* Email Templates */}
      <EmailTemplatesEditor
        emailHeaderStyle={emailHeaderStyle}
        setEmailHeaderStyle={setEmailHeaderStyle}
      />

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

      {/* Privacy Disclosure */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              {t('appearance.privacyDisclosure')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('appearance.privacyDisclosureDescription')}
            </p>
          </div>
          <Switch
            checked={privacyDisclosureEnabled}
            onCheckedChange={setPrivacyDisclosureEnabled}
          />
        </div>
        {privacyDisclosureEnabled && (
          <div className="space-y-2">
            <Label>{t('appearance.privacyDisclosureCustomText')}</Label>
            <textarea
              value={privacyDisclosureText}
              onChange={(e) => setPrivacyDisclosureText(e.target.value)}
              placeholder={t('appearance.privacyDisclosurePlaceholder')}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">
              {t('appearance.privacyDisclosureHint')}
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
