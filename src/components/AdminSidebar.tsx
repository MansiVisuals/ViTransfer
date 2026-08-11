'use client'

import { useAuth } from '@/components/AuthProvider'
import { Button } from '@/components/ui/button'
import { Bug, Building2, Calendar, ChevronLeft, ChevronRight, CircleHelp, Coffee, Container, ExternalLink, FolderKanban, LogOut, Menu, Settings, Shield, User, Users, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BrandLogo from '@/components/BrandLogo'
import ThemeToggle from '@/components/ThemeToggle'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTranslations } from 'next-intl'

const COLLAPSED_KEY = 'adminSidebarCollapsed'

// The rail renders md-and-up only and the drawer below md, so neither needs
// responsive label classes — each is handed showLabels directly.
const itemBase = 'flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-all duration-200'

function itemLayout(showLabels: boolean) {
  return showLabels ? 'px-3' : 'justify-center px-2'
}

// GitHub mark — lucide 1.x removed brand icons, so it's inlined here.
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function AboutDialog({ showLabels }: { showLabels: boolean }) {
  const t = useTranslations('nav')
  const repoUrl = 'https://github.com/MansiVisuals/ViTransfer'
  const websiteUrl = 'https://www.vitransfer.com'
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={`w-full text-muted-foreground hover:bg-accent hover:text-accent-foreground ${itemBase} ${itemLayout(showLabels)}`}
          aria-label={t('aboutViTransfer')}
          title={t('about')}
        >
          <CircleHelp className="h-5 w-5 shrink-0" />
          {showLabels && <span className="truncate">{t('about')}</span>}
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
                <GithubIcon className="w-4 h-4 mr-2" />
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
              <a href="https://hub.docker.com/r/mansivisuals/vitransfer" target="_blank" rel="noopener noreferrer">
                <Container className="w-4 h-4 mr-2" />
                {t('dockerHub')}
              </a>
            </Button>
            <Button
              className="w-full justify-start bg-[#FF5E5B] hover:bg-[#FF5E5B]/90 text-white border-0"
              onClick={() => {
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
  )
}

export default function AdminSidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const t = useTranslations('nav')
  const ta = useTranslations('auth')

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
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === 'true')
  }, [])

  // Rail and drawer can both be mounted, so match on the attribute rather than a single ref.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-user-menu]')) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserMenu])

  // Close the drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [drawerOpen])

  if (!user) return null

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSED_KEY, String(!prev))
      return !prev
    })
  }

  const navLinks: Array<{ href: string; label: string; icon: typeof FolderKanban }> = [
    { href: '/admin/projects', label: t('projects'), icon: FolderKanban },
    { href: '/admin/calendar', label: t('calendar'), icon: Calendar },
    { href: '/admin/clients', label: t('clients'), icon: Building2 },
    { href: '/admin/users', label: t('users'), icon: Users },
    { href: '/admin/settings', label: t('settings'), icon: Settings },
  ]

  if (showSecurityDashboard) {
    navLinks.push({ href: '/admin/security', label: t('security'), icon: Shield })
  }

  // showLabels is false only for the collapsed desktop rail; the drawer is always labelled.
  const renderPanel = (showLabels: boolean) => (
    <>
      <div className={`flex h-14 shrink-0 items-center border-b border-border/50 ${showLabels ? 'px-3' : 'justify-center px-2'}`}>
        <Link
          href="/admin/projects"
          className={`flex min-w-0 items-center rounded-lg transition-opacity hover:opacity-80 ${showLabels ? 'max-w-32' : 'max-w-10'}`}
          title="ViTransfer"
        >
          <BrandLogo height={28} maxWidth="100%" ariaHidden />
        </Link>
        {showLabels && (
          <button
            onClick={toggleCollapsed}
            className="ml-auto hidden rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:block"
            aria-label={t('collapseSidebar')}
            title={t('collapseSidebar')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {!showLabels && (
        <button
          onClick={toggleCollapsed}
          className="mx-auto mt-2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t('expandSidebar')}
          title={t('expandSidebar')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navLinks.map((link) => {
          const Icon = link.icon
          const isActive = pathname === link.href || (link.href !== '/admin/projects' && pathname?.startsWith(link.href))

          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              className={`${itemBase} ${itemLayout(showLabels)} ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-elevation'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {showLabels && <span className="truncate">{link.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border/50 p-2">
        <ThemeToggle variant="sidebar" collapsed={!showLabels} />
        <AboutDialog showLabels={showLabels} />

        <div data-user-menu className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={`w-full text-muted-foreground hover:bg-accent hover:text-accent-foreground ${itemBase} ${itemLayout(showLabels)}`}
            aria-label={user.name || user.email}
            title={user.name || user.email}
          >
            <User className="h-5 w-5 shrink-0" />
            {showLabels && <span className="truncate">{user.name || user.email}</span>}
          </button>
          {showUserMenu && (
            <div className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-lg border border-border bg-card shadow-elevation-lg">
              <div className="border-b border-border px-3 py-2.5">
                <p className="truncate text-sm font-medium">{user.name || user.email}</p>
                {user.name && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{user.role}</p>
              </div>
              <div className="p-1">
                <button
                  onClick={() => { setShowUserMenu(false); logout() }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  {ta('signOut')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      <aside
        className={`hidden shrink-0 flex-col border-r border-border/50 bg-card shadow-elevation-sm transition-[width] duration-200 md:flex ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        {renderPanel(!collapsed)}
      </aside>

      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-card px-3 shadow-elevation-sm md:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-accent"
          aria-label={t('openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/admin/projects" className="flex min-w-0 max-w-32 items-center" title="ViTransfer">
          <BrandLogo height={26} maxWidth="100%" ariaHidden />
        </Link>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-label={t('closeMenu')}
            tabIndex={-1}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border/50 bg-card shadow-elevation-lg">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-3.5 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={t('closeMenu')}
            >
              <X className="h-4 w-4" />
            </button>
            {renderPanel(true)}
          </div>
        </div>
      )}
    </>
  )
}
