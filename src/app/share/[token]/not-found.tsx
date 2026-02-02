'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileQuestion } from 'lucide-react'
import LogoMark from '@/components/LogoMark'

export default function ShareNotFound() {
  return (
    <div className="flex-1 min-h-0 bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <LogoMark size={64} className="mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-foreground mb-2">ViTransfer</h1>

        <Card className="mt-6">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2">
              <FileQuestion className="w-12 h-12 text-muted-foreground" />
            </div>
            <CardTitle>Link Not Found</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              This share link is invalid or has expired.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Please contact the person who shared it with you.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
