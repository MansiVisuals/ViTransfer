'use client'

import { useState } from 'react'
import { Workflow, MessageSquare, Layers, Upload, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'

export default function IntegrationsPage() {
  const [showPreorderModal, setShowPreorderModal] = useState(false)

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="max-w-4xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Workflow className="w-7 h-7 sm:w-8 sm:h-8" />
            Integrations
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Work directly from your editor with professional workflow integrations
          </p>
        </div>

        {/* Coming Soon Banner */}
        <div className="mb-8 p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 rounded-lg text-center">
          <h2 className="text-2xl font-bold mb-2">COMING SOON</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Professional workflow integrations will become available beginning of 2026.
          </p>
          <p className="text-sm text-muted-foreground">
            NLE integrations will be offered as a one-time purchase.
          </p>
          <p className="text-sm text-muted-foreground">
            These integrations help support the continued development of ViTransfer.
          </p>
          <p className="text-sm text-muted-foreground">
            The web app will always remain free and open-source.
          </p>
        </div>

        {/* Features Section */}
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h3 className="text-xl font-semibold mb-6">Features</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Import comments directly on your timeline with precise timecodes
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Layers className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Create new projects, videos and versions or work on existing projects
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Upload className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                Directly render and upload videos and optionally assets to ViTransfer without leaving your NLE
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Workflow className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">
                No browser hassle - everything directly in your editing software
              </p>
            </div>
          </div>
        </div>

        {/* Platforms Section */}
        <div className="bg-muted/30 border border-border rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold mb-4">Coming to</h3>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="text-base font-medium">DaVinci Resolve Studio</div>
            <div className="hidden sm:block text-muted-foreground">•</div>
            <div className="text-base font-medium">Adobe Premiere Pro</div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Currently being tested on DaVinci Resolve Studio 20.x and Premiere Pro 25.6.x
          </p>
        </div>

        {/* Hidden Pre-order Button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => setShowPreorderModal(true)}
            className="opacity-20 hover:opacity-100 transition-opacity duration-300"
            title="Special offer"
          >
            <Gift className="w-4 h-4 text-primary" />
          </button>
        </div>
        </div>
      </div>

      {/* Pre-order Modal */}
      <Dialog open={showPreorderModal} onOpenChange={setShowPreorderModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              Special Offer!
            </DialogTitle>
            <DialogDescription>
              Pre-order integrations with 33% off
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-foreground">
              Get early access to ViTransfer NLE integrations with an exclusive 33% discount!
            </p>

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Discount Code</span>
                <code className="text-sm font-mono bg-background px-2 py-1 rounded border border-border text-primary">
                  VITRANSFER-33-OFF
                </code>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this code at checkout for 33% off
              </p>
            </div>

            <a
              href="https://ko-fi.com/s/bb6256137a"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button className="w-full">
                <Gift className="w-4 h-4 mr-2" />
                Pre-order Now (33% Off)
              </Button>
            </a>

            <p className="text-xs text-muted-foreground text-center">
              Professional workflow integrations for DaVinci Resolve & Premiere Pro
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
