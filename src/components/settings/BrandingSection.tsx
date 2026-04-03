import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { Upload, Trash2, Image as ImageIcon } from 'lucide-react'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { EmailTemplatesEditor } from '@/components/settings/EmailTemplatesSection'

interface BrandingSectionProps {
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
  show: boolean
  setShow: (value: boolean) => void
  collapsible?: boolean
}

export function BrandingSection({
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
  show,
  setShow,
  collapsible,
}: BrandingSectionProps) {
  const t = useTranslations('settings')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <CollapsibleSection
      className="border-border"
      title={t('branding.title')}
      description={t('branding.description')}
      open={show}
      onOpenChange={setShow}
      contentClassName="space-y-4 border-t pt-4"
      collapsible={collapsible}
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

      {/* Email Templates */}
      <EmailTemplatesEditor
        emailHeaderStyle={emailHeaderStyle}
        setEmailHeaderStyle={setEmailHeaderStyle}
      />
    </CollapsibleSection>
  )
}
