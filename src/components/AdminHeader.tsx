'use client'

import { useAuth } from '@/components/AuthProvider'
import { Button } from '@/components/ui/button'
import { LogOut, User, Settings, Users, FolderKanban, BarChart3, Shield, Workflow } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

export default function AdminHeader() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false)

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

  if (!user) return null

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
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
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap ${
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
