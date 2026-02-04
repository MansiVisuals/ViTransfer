'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Coffee } from 'lucide-react'
import { useState, useEffect } from 'react'

// Declare global window interface for Ko-fi dialog control
declare global {
  interface Window {
    openKofiWidget?: () => void
    closeKofiWidget?: () => void
  }
}

export default function KofiWidget() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Expose global functions to open/close Ko-fi dialog
    window.openKofiWidget = () => setIsOpen(true)
    window.closeKofiWidget = () => setIsOpen(false)

    return () => {
      delete window.openKofiWidget
      delete window.closeKofiWidget
    }
  }, [])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-primary" />
            Support ViTransfer
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">
          <iframe 
            id='kofiframe' 
            src='https://ko-fi.com/mansivisuals/?hidefeed=true&widget=true&embed=true&preview=true' 
            style={{
              border: 'none',
              width: '100%',
              background: '#f9f9f9',
              borderRadius: '8px'
            }}
            height='712' 
            title='Support ViTransfer on Ko-fi'
            loading="lazy"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
