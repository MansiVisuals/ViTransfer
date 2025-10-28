'use client'

import { Button } from './ui/button'
import { useState } from 'react'

interface ShareLinkProps {
  shareUrl: string
}

export default function ShareLink({ shareUrl }: ShareLinkProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-2">Share Link</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          readOnly
          value={shareUrl}
          className="flex-1 px-3 py-2 border rounded-md text-xs sm:text-sm bg-muted truncate"
        />
        <Button onClick={handleCopy} variant="outline" className="w-full sm:w-auto">
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
