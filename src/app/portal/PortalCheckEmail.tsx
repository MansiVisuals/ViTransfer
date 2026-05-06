'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail } from 'lucide-react'

interface Props {
  email: string
  onBack: () => void
}

export default function PortalCheckEmail({ email, onBack }: Props) {
  const t = useTranslations('portal')

  return (
    <Card className="bg-card border-border w-full">
      <CardHeader className="text-center space-y-3">
        <div className="flex justify-center">
          <Mail className="w-12 h-12 text-muted-foreground" />
        </div>
        <CardTitle className="text-foreground">{t('checkEmailHeading')}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t('checkEmailBody', { email })}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground text-center">
          {t('checkEmailHint')}
        </p>
        <Button variant="outline" onClick={onBack} className="w-full">
          {t('useDifferentEmail')}
        </Button>
      </CardContent>
    </Card>
  )
}
