'use client'

import { useAuth } from '@/components/AuthProvider'
import { Button } from '@/components/ui/button'
import { Bug, Building2, Calendar, CircleHelp, Coffee, Container, ExternalLink, FolderKanban, Github, LogOut, Settings, Shield, User, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTranslations } from 'next-intl'

export default function AdminHeader() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const t = useTranslations('nav')
  const ta = useTranslations('auth')

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

  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserMenu])

  if (!user) return null

  const repoUrl = 'https://github.com/MansiVisuals/ViTransfer'
  const websiteUrl = 'https://www.vitransfer.com'
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION

  const navLinks: Array<{ href: string; label: string; icon: typeof FolderKanban; title?: string }> = [
    { href: '/admin/projects', label: t('projects'), icon: FolderKanban },
    { href: '/admin/calendar', label: t('calendar'), icon: Calendar },
    { href: '/admin/clients', label: t('clients'), icon: Building2 },
    { href: '/admin/users', label: t('users'), icon: Users },
    { href: '/admin/settings', label: t('settings'), icon: Settings },
  ]

  // Add Security link if enabled
  if (showSecurityDashboard) {
    navLinks.push({ href: '/admin/security', label: t('security'), icon: Shield })
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
                    title={link.title || link.label || undefined}
                    className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-elevation'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                    {link.label && <span className="hidden sm:inline">{link.label}</span>}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Dialog>
              <DialogTrigger asChild>
                <button
                  className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors shadow-sm"
                  aria-label={t('aboutViTransfer')}
                  title={t('about')}
                >
                  <CircleHelp className="h-5 w-5 text-foreground" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CircleHelp className="w-5 h-5 text-primary" />
                    {t('aboutViTransfer')}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t('aboutDescription')}
                  </p>

                  {appVersion && (
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm font-medium">Version {appVersion}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        {t('website')}
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                        <Github className="w-4 h-4 mr-2" />
                        {t('githubRepo')}
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a href={`${repoUrl}/issues`} target="_blank" rel="noopener noreferrer">
                        <Bug className="w-4 h-4 mr-2" />
                        {t('reportIssue')}
                      </a>
                    </Button>
                    <Button asChild variant="outline" className="w-full justify-start">
                      <a href="https://hub.docker.com/r/crypt010/vitransfer" target="_blank" rel="noopener noreferrer">
                        <Container className="w-4 h-4 mr-2" />
                        {t('dockerHub')}
                      </a>
                    </Button>
                    <Button 
                      className="w-full justify-start bg-[#FF5E5B] hover:bg-[#FF5E5B]/90 text-white border-0"
                      onClick={() => {
                        // Open Ko-fi widget dialog
                        if (typeof window !== 'undefined' && window.openKofiWidget) {
                          window.openKofiWidget()
                        }
                      }}
                    >
                      <Coffee className="w-4 h-4 mr-2" />
                      {t('supportViTransfer')}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors shadow-sm"
                aria-label={user.name || user.email}
                title={user.name || user.email}
              >
                <User className="h-5 w-5 text-foreground" />
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border bg-card shadow-elevation-lg z-50">
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-sm font-medium truncate">{user.name || user.email}</p>
                    {user.name && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{user.role}</p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => { setShowUserMenu(false); logout() }}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded-md text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {ta('signOut')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
