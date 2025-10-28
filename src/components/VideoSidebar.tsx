'use client'

import { useState } from 'react'
import { Play, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoGroup {
  name: string
  videos: any[]
  versionCount: number
}

interface VideoSidebarProps {
  videosByName: Record<string, any[]>
  activeVideoName: string
  onVideoSelect: (videoName: string) => void
  className?: string
}

export default function VideoSidebar({
  videosByName,
  activeVideoName,
  onVideoSelect,
  className
}: VideoSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const videoGroups: VideoGroup[] = Object.entries(videosByName).map(([name, videos]) => ({
    name,
    videos,
    versionCount: videos.length
  }))

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:block bg-card border-r border-border transition-all duration-300',
          'sticky top-0 h-screen overflow-y-auto',
          className
        )}
      >
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Videos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {videoGroups.length} {videoGroups.length === 1 ? 'video' : 'videos'}
          </p>
        </div>

        <nav className="p-3">
          {videoGroups.map((group) => (
            <button
              key={group.name}
              onClick={() => onVideoSelect(group.name)}
              className={cn(
                'w-full text-left p-3 rounded-lg transition-all duration-200',
                'hover:bg-accent hover:text-accent-foreground',
                'flex items-center justify-between gap-3',
                activeVideoName === group.name
                  ? 'bg-primary/10 text-primary font-medium border border-primary/20'
                  : 'text-foreground'
              )}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    activeVideoName === group.name ? 'bg-primary' : 'bg-muted-foreground'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.versionCount} {group.versionCount === 1 ? 'version' : 'versions'}
                  </p>
                </div>
              </div>
              {activeVideoName === group.name && (
                <Play className="w-4 h-4 shrink-0 text-primary" fill="currentColor" />
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile Dropdown */}
      <div className="lg:hidden mb-4 bg-card border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-accent transition-colors"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{activeVideoName}</p>
            <p className="text-xs text-muted-foreground">
              {videoGroups.find(g => g.name === activeVideoName)?.versionCount || 0} versions
            </p>
          </div>
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          )}
        </button>

        {!isCollapsed && (
          <div className="border-t border-border">
            {videoGroups.map((group) => (
              <button
                key={group.name}
                onClick={() => {
                  onVideoSelect(group.name)
                  setIsCollapsed(true)
                }}
                className={cn(
                  'w-full text-left p-4 transition-colors',
                  'hover:bg-accent',
                  'flex items-center justify-between gap-3',
                  'border-b border-border last:border-b-0',
                  activeVideoName === group.name
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground'
                )}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      activeVideoName === group.name ? 'bg-primary' : 'bg-muted-foreground'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.versionCount} {group.versionCount === 1 ? 'version' : 'versions'}
                    </p>
                  </div>
                </div>
                {activeVideoName === group.name && (
                  <Play className="w-4 h-4 shrink-0 text-primary" fill="currentColor" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
