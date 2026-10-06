'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Download, Grid3X3, Loader2, X } from 'lucide-react'
import PhotoLightbox from './PhotoLightbox'
import BrandLogo from './BrandLogo'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import { cn } from '@/lib/utils'
import { useAlbumGallery, type PhotoZipScope } from '@/hooks/useAlbumGallery'
import PhotoGrid from './PhotoGrid'
import { Button } from './ui/button'

/** URL parameter that keeps the open album linkable */
const ALBUM_PARAM = 'album'

interface PhotoDeliveryGalleryProps {
  /** Omit when the viewer has no album access (the gallery shows its empty state) */
  projectId?: string
  /** Share bearer token; omit for admin sessions (uses apiFetch instead) */
  shareToken?: string
  title: string
  description?: string | null
  allowPhotoDownload: boolean
  /** Page-level actions, beside the back control (e.g. reverse share upload) */
  actions?: ReactNode
  /** Renders one back control in the bar. Omit when there is nowhere to return to. */
  onBack?: () => void
  backLabel?: string
  /**
   * True when this gallery is the whole delivery, so the albums appear as tabs
   * because no overview exists to pick them from. False when one album was
   * opened from an overview, which is already the album switcher.
   */
  standalone?: boolean
  showLanguageToggle?: boolean
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/**
 * The album view for every client: a floating bar and a masonry grid of the open
 * album. As a whole delivery it also opens on a cover and carries the albums as
 * tabs; opened from a project overview it does neither, because the overview is
 * the switcher. Also used on the admin share preview (without a share token).
 */
export default function PhotoDeliveryGallery({
  projectId,
  shareToken,
  title,
  description,
  allowPhotoDownload,
  actions,
  onBack,
  backLabel,
  standalone = true,
  showLanguageToggle = true,
}: PhotoDeliveryGalleryProps) {
  const t = useTranslations('photos')
  const tc = useTranslations('common')
  const ts = useTranslations('share')

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const galleryStartRef = useRef<HTMLDivElement | null>(null)
  const downloadMenuRef = useRef<HTMLDivElement | null>(null)
  const downloadButtonRef = useRef<HTMLButtonElement | null>(null)
  const albumNavRef = useRef<HTMLElement | null>(null)

  const {
    albums,
    albumsLoading,
    selectedAlbum,
    setSelectedAlbum,
    photos,
    totalPhotos,
    photosLoading,
    sentinelRef,
    loadMore,
    buildPhotoUrl,
    downloadPhoto,
    downloadZip,
    downloading,
    selectedIds,
    toggleSelect,
    clearSelection,
  } = useAlbumGallery({ projectId, shareToken, scrollRootRef: scrollRef })

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)

  // Albums still waiting for their first upload stay out of the delivery
  const visibleAlbums = useMemo(() => albums.filter(album => album.photoCount > 0), [albums])

  // Open the linked album, or the first one, as soon as the list arrives
  useEffect(() => {
    if (selectedAlbum || visibleAlbums.length === 0) return
    const url = new URL(window.location.href)
    const linked = visibleAlbums.find(album => album.id === url.searchParams.get(ALBUM_PARAM))
    if (!linked && url.searchParams.has(ALBUM_PARAM)) {
      url.searchParams.delete(ALBUM_PARAM)
      window.history.replaceState(null, '', url)
    }
    setSelectedAlbum(linked ?? visibleAlbums[0])
  }, [visibleAlbums, selectedAlbum, setSelectedAlbum])

  // Keep the active tab in view on the swipeable (touch) tab strip; scroll the strip only, never the page
  useEffect(() => {
    const nav = albumNavRef.current
    const tab = nav?.querySelector<HTMLElement>('[aria-current]')
    if (!nav || !tab || nav.scrollWidth <= nav.clientWidth) return
    nav.scrollLeft = tab.offsetLeft - nav.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2
  }, [selectedAlbum])

  // The lightbox owns Escape and focus while open
  useEffect(() => {
    if (lightboxIndex !== null) setDownloadMenuOpen(false)
  }, [lightboxIndex])

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])


  useEffect(() => {
    if (!downloadMenuOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) setDownloadMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setDownloadMenuOpen(false)
      downloadButtonRef.current?.focus()
    }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [downloadMenuOpen])


  // The open album's own cover; any album's cover is better than none
  const coverAlbum = selectedAlbum?.coverPhotoId && selectedAlbum.contentToken
    ? selectedAlbum
    : visibleAlbums.find(album => album.coverPhotoId && album.contentToken) ?? null
  const coverUrl = coverAlbum
    ? `/api/content/photo/${coverAlbum.contentToken}?photoId=${coverAlbum.coverPhotoId}&variant=full`
    : null

  const scrollToGallery = useCallback(() => {
    galleryStartRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
  }, [])

  const openAlbum = (albumId: string) => {
    const album = visibleAlbums.find(a => a.id === albumId)
    if (!album || album.id === selectedAlbum?.id) return
    // Start the new album from its first row when the viewer was deep in the last one.
    // Jump before swapping: a smooth scroll would glide through the half-loaded album.
    const scroller = scrollRef.current
    const start = galleryStartRef.current
    if (scroller && start && scroller.scrollTop > start.offsetTop) {
      // scrollIntoView honours the target's scroll-margin, so the grid clears the pinned bar
      start.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
    setSelectedAlbum(album)
    const url = new URL(window.location.href)
    url.searchParams.set(ALBUM_PARAM, album.id)
    window.history.replaceState(null, '', url)
  }


  const runDownload = (scope: PhotoZipScope) => {
    setDownloadMenuOpen(false)
    downloadZip(scope)
  }

  const selecting = selectedIds.size > 0
  const photoTotal = visibleAlbums.reduce((sum, album) => sum + album.photoCount, 0)
  const canDownload = allowPhotoDownload && photoTotal > 0

  return (
    <div ref={scrollRef} className="fixed inset-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-background text-foreground">
      {/* Cover */}
      <section className="relative isolate flex h-svh min-h-[420px] w-full items-center justify-center overflow-hidden bg-neutral-950 text-white">
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            onLoad={() => setCoverLoaded(true)}
            className={cn(
              'absolute inset-0 -z-10 h-full w-full object-cover object-[50%_30%] motion-safe:transition-opacity motion-safe:duration-700 motion-safe:ease-out',
              coverLoaded ? 'opacity-100' : 'opacity-0'
            )}
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/35 via-black/15 to-black/55" />
        <div className="w-full max-w-4xl px-6 text-center">
          {/* Trailing letter-spacing pushes centered caps left; pad it back */}
          <h1 className="break-words pl-[0.15em] text-3xl font-light uppercase leading-tight tracking-[0.15em] text-balance sm:pl-[0.25em] sm:text-5xl sm:tracking-[0.25em] lg:text-6xl">
            {title}
          </h1>
          {description && (
            <p className="mx-auto mt-5 line-clamp-3 max-w-xl text-sm font-light leading-relaxed text-white/80 sm:text-base">
              {description}
            </p>
          )}
          <Button
            size="lg"
            onClick={scrollToGallery}
            className="mt-10 pl-[calc(2rem+0.3em)] pr-8 text-[11px] font-medium uppercase tracking-[0.3em]"
          >
            {t('viewGallery')}
          </Button>
        </div>
      </section>

      <div ref={galleryStartRef} className="scroll-mt-16" />

      {/* Gallery bar — the player's floating control bar, not a page header */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 p-2 sm:p-3">
        <div className="pointer-events-auto rounded-xl bg-card/95 px-3 py-2 backdrop-blur-sm sm:px-4 sm:py-2.5">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5">
              {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack} title={backLabel ?? ts('backToOverview')} className="gap-1.5">
                  <Grid3X3 className="h-4 w-4" />
                  <span className="hidden sm:inline">{backLabel ?? ts('backToOverview')}</span>
                </Button>
              )}
              {actions}
            </div>

            {standalone && visibleAlbums.length > 1 && (
              <nav
                ref={albumNavRef}
                aria-label={t('photoAlbums')}
                // One row, so the strip scrolls rather than wrapping
                className="flex min-w-0 flex-1 gap-x-4 overflow-x-auto sm:gap-x-6"
                style={{ scrollbarWidth: 'none' }}
              >
                {visibleAlbums.map(album => {
                  const isActive = album.id === selectedAlbum?.id
                  return (
                    <button
                      key={album.id}
                      type="button"
                      onClick={() => openAlbum(album.id)}
                      aria-current={isActive ? 'true' : undefined}
                      title={album.name}
                      className={cn(
                        'max-w-[12rem] shrink-0 truncate border-b-2 pb-0.5 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors sm:text-xs',
                        isActive
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {album.name}
                    </button>
                  )
                })}
              </nav>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {canDownload && (
                <div
                  ref={downloadMenuRef}
                  className="relative"
                  onBlur={(e) => {
                    // Tabbing out closes the menu; clicks outside are handled by the mousedown listener
                    if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setDownloadMenuOpen(false)
                  }}
                >
                  <Button
                    ref={downloadButtonRef}
                    variant="ghost"
                    size="sm"
                    onClick={() => (visibleAlbums.length > 1 ? setDownloadMenuOpen(open => !open) : runDownload('album'))}
                    disabled={downloading}
                    aria-expanded={visibleAlbums.length > 1 ? downloadMenuOpen : undefined}
                    className="text-muted-foreground hover:text-foreground"
                    title={visibleAlbums.length > 1 ? tc('download') : t('downloadAlbum')}
                  >
                    {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    <span className="hidden sm:inline">{tc('download')}</span>
                  </Button>
                  {downloadMenuOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-elevation-lg">
                      {selectedAlbum && (
                        <button
                          type="button"
                          onClick={() => runDownload('album')}
                          className="flex w-full flex-col items-start px-4 py-2.5 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                        >
                          <span className="text-sm">{t('downloadAlbum')}</span>
                          <span className="w-full truncate text-xs text-muted-foreground">{selectedAlbum.name}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => runDownload('project')}
                        className="flex w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
                      >
                        {t('downloadAllAlbums', { count: visibleAlbums.length })}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {showLanguageToggle && <LanguageToggle />}
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Grid: at least a viewport tall so switching to a shorter album never drags the cover back into view */}
      <section aria-label={selectedAlbum?.name ?? title} className="min-h-svh px-1.5 py-1.5 sm:px-6 sm:py-6 lg:px-10">
        {albumsLoading || photosLoading || (visibleAlbums.length > 0 && !selectedAlbum) ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visibleAlbums.length === 0 ? (
          <p className="py-24 text-center text-sm text-muted-foreground">
            {/* Without album access (guests on a link that hides photos from them) nothing will show up later */}
            {projectId ? t('galleryEmpty') : t('noPhotosFound')}
          </p>
        ) : photos.length === 0 ? (
          <p className="py-24 text-center text-sm text-muted-foreground">{t('noPhotosYet')}</p>
        ) : (
          <>
            <PhotoGrid
              photos={photos}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onPhotoClick={setLightboxIndex}
              allowDownload={allowPhotoDownload}
              onDownloadPhoto={downloadPhoto}
            />
            {photos.length < totalPhotos && (
              <div ref={sentinelRef} className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </section>

      <footer className="flex flex-col items-center gap-4 px-4 pb-10 pt-16">
        <BrandLogo height={28} />
        <a
          href="https://www.vitransfer.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
        >
          Powered by ViTransfer
        </a>
      </footer>

      {/* Selection bar */}
      {allowPhotoDownload && selecting && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-card/95 px-3 py-2 shadow-elevation-xl backdrop-blur-sm">
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('selectedCount', { count: selectedIds.size })}
            </span>
            <Button size="sm" onClick={() => runDownload('selection')} disabled={downloading}>
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {tc('download')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearSelection}
              aria-label={tc('deselectAll')}
              title={tc('deselectAll')}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          buildPhotoUrl={buildPhotoUrl}
          onClose={closeLightbox}
          onNavigate={setLightboxIndex}
          canDownload={allowPhotoDownload}
          total={totalPhotos}
          onNearEnd={loadMore}
          variant="gallery"
        />
      )}
    </div>
  )
}
