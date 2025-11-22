'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, ChevronDown, ChevronUp, GripVertical, CheckCircle2 } from 'lucide-react'
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
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(256) // Default 256px (w-64)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  const videoGroups: VideoGroup[] = Object.entries(videosByName).map(([name, videos]) => ({
    name,
    videos,
    versionCount: videos.length
  }))

  // Load saved width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('share_sidebar_width')
    if (saved) {
      const width = parseInt(saved)
      if (width >= 200 && width <= window.innerWidth * 0.3) {
        setSidebarWidth(width)
      }
    }
  }, [])

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const newWidth = e.clientX
      const minWidth = 200
      const maxWidth = window.innerWidth * 0.3

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false)
        localStorage.setItem('share_sidebar_width', sidebarWidth.toString())
      }
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, sidebarWidth])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        ref={sidebarRef}
        style={{ width: `${sidebarWidth}px` }}
        className={cn(
          'hidden lg:block bg-card border-r border-border relative',
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
          {(() => {
            // Split videos into For Review and Approved groups
            const forReview = videoGroups.filter(g => !g.videos.some((v: any) => v.approved === true))
            const approved = videoGroups.filter(g => g.videos.some((v: any) => v.approved === true))

            const renderVideoButton = (group: VideoGroup) => {
              const hasApprovedVideo = group.videos.some((v: any) => v.approved === true)
              return (
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
                    hasApprovedVideo ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
                    ) : (
                      <Play className="w-4 h-4 shrink-0 text-primary" fill="currentColor" />
                    )
                  )}
                </button>
              )
            }

            return (
              <>
                {forReview.length > 0 && (
                  <>
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      For Review
                    </div>
                    <div className="space-y-1 mb-4">
                      {forReview.map(renderVideoButton)}
                    </div>
                  </>
                )}

                {approved.length > 0 && (
                  <>
                    {forReview.length > 0 && (
                      <div className="border-t border-border my-3" />
                    )}
                    <div className="px-3 py-2 text-xs font-semibold text-success uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3" />
                      Approved
                    </div>
                    <div className="space-y-1">
                      {approved.map(renderVideoButton)}
                    </div>
                  </>
                )}
              </>
            )
          })()}
        </nav>

        {/* Footer - Positioned at bottom */}
        <div className="sticky bottom-0 border-t border-border bg-card py-3 px-6">
          <div className="text-center text-xs text-muted-foreground space-y-1">
            <div>
              Powered by{' '}
              <a
                href="https://github.com/MansiVisuals/ViTransfer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                ViTransfer
              </a>
            </div>
            {process.env.NEXT_PUBLIC_APP_VERSION && (
              <div className="text-[10px] uppercase tracking-wide">
                Version: {process.env.NEXT_PUBLIC_APP_VERSION}
              </div>
            )}
          </div>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize',
            'hover:bg-primary transition-colors',
            'group'
          )}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-4 h-4 text-primary" />
          </div>
        </div>
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
            {(() => {
              // Split videos into For Review and Approved groups
              const forReview = videoGroups.filter(g => !g.videos.some((v: any) => v.approved === true))
              const approved = videoGroups.filter(g => g.videos.some((v: any) => v.approved === true))

              const renderVideoButton = (group: VideoGroup, isLast: boolean) => {
                const hasApprovedVideo = group.videos.some((v: any) => v.approved === true)
                return (
                  <button
                    key={group.name}
                    onClick={() => {
                      onVideoSelect(group.name)
                      // Don't collapse - keep dropdown open for easy video switching
                    }}
                    className={cn(
                      'w-full text-left p-4 transition-colors',
                      'hover:bg-accent',
                      'flex items-center justify-between gap-3',
                      'border-b border-border',
                      isLast && approved.length === 0 && 'last:border-b-0',
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
                      hasApprovedVideo ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
                      ) : (
                        <Play className="w-4 h-4 shrink-0 text-primary" fill="currentColor" />
                      )
                    )}
                  </button>
                )
              }

              return (
                <>
                  {forReview.length > 0 && (
                    <>
                      <div className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-accent/30">
                        For Review
                      </div>
                      {forReview.map((group, index) => renderVideoButton(group, index === forReview.length - 1))}
                    </>
                  )}

                  {approved.length > 0 && (
                    <>
                      <div className="px-4 py-3 text-xs font-semibold text-success uppercase tracking-wider bg-success-visible flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3" />
                        Approved
                      </div>
                      {approved.map((group, index) => (
                        <button
                          key={group.name}
                          onClick={() => {
                            onVideoSelect(group.name)
                          }}
                          className={cn(
                            'w-full text-left p-4 transition-colors',
                            'hover:bg-accent',
                            'flex items-center justify-between gap-3',
                            'border-b border-border',
                            index === approved.length - 1 && 'last:border-b-0',
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
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
                          )}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>
    </>
  )
}
