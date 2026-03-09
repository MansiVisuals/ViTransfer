'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileQuestion, ArrowLeft } from 'lucide-react'

export default function AdminNotFound() {
  const t = useTranslations('notFound')
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <FileQuestion className="w-12 h-12 text-muted-foreground" />
          </div>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            {t('description')}
          </p>
          <Button asChild className="w-full">
            <Link href="/admin/projects">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('backToProjects')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
