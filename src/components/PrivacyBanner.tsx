'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PrivacyBannerProps {
  /** Custom text from admin settings; null = use default i18n text */
  customText?: string | null
}

const STORAGE_KEY = 'vt-privacy-accepted'

export default function PrivacyBanner({ customText }: PrivacyBannerProps) {
  const t = useTranslations('privacy')
  const [accepted, setAccepted] = useState(true) // default true to avoid flash
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setAccepted(stored === 'true')
  }, [])

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setAccepted(true)
  }

  const handleDecline = () => {
    localStorage.setItem(STORAGE_KEY, 'declined')
    setAccepted(true) // hide the banner (they still see the page—security logging is legitimate interest)
  }

  if (accepted) return null

  const disclosureText = customText || t('defaultDisclosureText')

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-3 sm:p-4">
      <div className="max-w-2xl mx-auto bg-card border border-border rounded-xl shadow-lg">
        <div className="px-4 py-3 sm:px-5 sm:py-4">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t('title')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('summary')}
              </p>
            </div>
          </div>

          {/* Expandable full text */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-primary hover:underline mt-2 ml-8"
          >
            {expanded ? t('readLess') : t('readMore')}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {expanded && (
            <div className="mt-2 ml-8 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
              {disclosureText}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDecline}
              className="text-xs"
            >
              {t('decline')}
            </Button>
            <Button
              size="sm"
              onClick={handleAccept}
              className="text-xs"
            >
              {t('accept')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
