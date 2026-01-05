'use client'

import { useAuth } from '@/components/AuthProvider'
import { Button } from '@/components/ui/button'
import { BarChart3, CircleHelp, FolderKanban, LogOut, Settings, Shield, User, Users, Workflow } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export default function AdminHeader() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false)
  const [instanceUrl, setInstanceUrl] = useState('')

  // Fetch security settings to check if security dashboard should be shown
  useEffect(() => {
    async function fetchSecuritySettings() {
      try {
        const response = await apiFetch('/api/settings')
        if (response.ok) {
          const data = await response.json()
          setShowSecurityDashboard(data.security?.viewSecurityEvents ?? false)
        }
      } catch (error) {
        // Security settings fetch failed - using defaults
      }
    }

    fetchSecuritySettings()
  }, [])

  useEffect(() => {
    setInstanceUrl(window.location.origin)
  }, [])

  if (!user) return null

  const repoUrl = 'https://github.com/MansiVisuals/ViTransfer'
  const websiteUrl = 'https://www.vitransfer.com'
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION

  const navLinks = [
    { href: '/admin/projects', label: 'Projects', icon: FolderKanban },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/integrations', label: 'Integrations', icon: Workflow },
  ]

  // Add Security link if enabled
  if (showSecurityDashboard) {
    navLinks.push({ href: '/admin/security', label: 'Security', icon: Shield })
  }

  return (
    <div className="bg-card border-b border-border/50 shadow-elevation-sm backdrop-blur-sm">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-6 flex-1 min-w-0">
            <nav className="flex gap-1 sm:gap-2 overflow-x-auto">
              {navLinks.map((link) => {
                const Icon = link.icon
                const isActive = pathname === link.href || (link.href !== '/admin/projects' && pathname?.startsWith(link.href))

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-elevation'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                    <span className="hidden sm:inline">{link.label}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="max-w-[150px] lg:max-w-none truncate">{user.email}</span>
            </div>
            <ThemeToggle />
            <Dialog>
              <DialogTrigger asChild>
                <button
                  className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors shadow-sm"
                  aria-label="About ViTransfer"
                  title="About"
                >
                  <CircleHelp className="h-5 w-5 text-foreground" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CircleHelp className="h-5 w-5" />
                    About ViTransfer
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="text-sm font-medium">Build</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {appVersion ? `Version ${appVersion}` : 'Self-hosted build'}
                      {instanceUrl ? ` • ${instanceUrl}` : ''}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                        Website
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                        GitHub Repository
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a href={`${repoUrl}/issues`} target="_blank" rel="noopener noreferrer">
                        Report an Issue
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a href="https://hub.docker.com/r/crypt010/vitransfer" target="_blank" rel="noopener noreferrer">
                        Docker Hub
                      </a>
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="default"
              onClick={logout}
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
