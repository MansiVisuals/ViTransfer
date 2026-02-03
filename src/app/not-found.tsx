'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'

export default function NotFound() {
  return (
    <div className="flex-1 min-h-0 bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <BrandLogo height={64} className="mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-foreground mb-2">ViTransfer</h1>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Page Not Found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The page you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button asChild className="w-full">
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Link>
            </Button>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground mt-4">Error 404</p>
      </div>
    </div>
  )
}
