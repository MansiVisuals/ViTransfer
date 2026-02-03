import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { Monitor, Moon, Sun, Check, Upload, Trash2, Image as ImageIcon } from 'lucide-react'
import { useRef } from 'react'

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
  show: boolean
  setShow: (value: boolean) => void
}

export function AppearanceSection({
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
  show,
  setShow
}: AppearanceSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const themeOptions = [
    { value: 'auto', label: 'Auto (System)', icon: Monitor, description: 'Follow device settings' },
    { value: 'light', label: 'Light', icon: Sun, description: 'Always use light theme' },
    { value: 'dark', label: 'Dark', icon: Moon, description: 'Always use dark theme' },
  ]

  return (
    <CollapsibleSection
      className="border-border"
      title="Branding & Appearance"
      description="Configure company identity, domain, theme and accent colors"
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
    >
      {/* Company Name */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label htmlFor="companyName">Company Name</Label>
        <Input
          id="companyName"
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g., Studio, Your Company Name"
        />
        <p className="text-xs text-muted-foreground">
          Displayed in email notifications and throughout the application
        </p>
      </div>

      {/* Custom Logo Upload */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label>Custom Logo (SVG)</Label>
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
              <img src={brandingLogoUrl} alt="Custom logo preview" className="w-full h-full object-contain" />
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
              {logoUploading ? 'Uploading…' : brandingLogoUrl ? 'Replace Logo' : 'Upload Logo'}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card text-sm text-destructive hover:border-destructive/60 hover:text-destructive transition-colors disabled:opacity-50"
              onClick={onRemoveLogo}
              disabled={!brandingLogoUrl || logoUploading}
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
          </div>
        </div>
        {logoError ? (
          <p className="text-xs text-destructive font-medium">{logoError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Upload an SVG up to 300 KB. Appears in app screens and emails. Favicons stay unchanged.
          </p>
        )}
      </div>

      {/* Application Domain */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label htmlFor="appDomain">Application Domain</Label>
        <Input
          id="appDomain"
          type="text"
          value={appDomain}
          onChange={(e) => setAppDomain(e.target.value)}
          placeholder="e.g., https://yourdomain.com"
        />
        <p className="text-xs text-muted-foreground">
          Include protocol (https://) and no trailing slash. Used for generating share links.
        </p>
      </div>

      {/* Theme Selection */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label>Default Theme</Label>
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
          Users can still toggle the theme using the button in the header.
        </p>
      </div>

      {/* Accent Color Selection */}
      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label>Accent Color</Label>
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
                <span className="text-xs text-muted-foreground">{color.name}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Choose an accent color for buttons, links, and highlights throughout the application.
        </p>
      </div>
    </CollapsibleSection>
  )
}
