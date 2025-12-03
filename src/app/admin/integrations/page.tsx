'use client'

import { Workflow, MessageSquare, Layers, Upload } from 'lucide-react'

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
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
      </div>
    </div>
  )
}
