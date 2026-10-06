'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Download, ImageIcon, Loader2, X } from 'lucide-react'
import PhotoLightbox from './PhotoLightbox'
import BrandLogo from './BrandLogo'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import { cn } from '@/lib/utils'
import { useAlbumGallery, type PhotoZipScope } from '@/hooks/useAlbumGallery'
import type { GalleryPhoto } from './PhotoGrid'

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
  /** Shown before the title in the gallery bar and over the cover (e.g. back to project) */
  leadingActions?: ReactNode
  /** Shown next to the download button in the gallery bar (e.g. reverse share upload) */
  trailingActions?: ReactNode
  showLanguageToggle?: boolean
}

/** Column count for the masonry grid, from the grid's own width. */
function columnsForWidth(width: number): number {
  if (width < 640) return 2
  if (width < 1024) return 3
  if (width < 1536) return 4
  return 5
}

/** Height-to-width ratio; unprocessed photos hold a square slot. */
function photoRatio(photo: GalleryPhoto): number {
  return photo.width && photo.height ? photo.height / photo.width : 1
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/**
 * Share page for links that deliver photos only: a full-bleed cover, a sticky
 * bar with the albums as tabs, and a masonry grid of the open album. The first
 * album opens straight away, so a single-album delivery never shows an overview.
 * Also used on the admin share preview (without a share token).
 */
export default function PhotoDeliveryGallery({
  projectId,
  shareToken,
  title,
  description,
  allowPhotoDownload,
  leadingActions,
  trailingActions,
  showLanguageToggle = true,
}: PhotoDeliveryGalleryProps) {
  const t = useTranslations('photos')
  const tc = useTranslations('common')

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const galleryStartRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
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
  const [columnCount, setColumnCount] = useState(3)

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
    const node = gridRef.current
    if (!node) return
    const update = () => setColumnCount(columnsForWidth(node.clientWidth))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

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

  // Greedy shortest-column placement keeps the reading order left to right
  // and stays stable while further pages are appended.
  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => ({ height: 0, items: [] as Array<{ photo: GalleryPhoto; index: number }> }))
    photos.forEach((photo, index) => {
      const shortest = cols.reduce((min, col) => (col.height < min.height ? col : min), cols[0])
      shortest.items.push({ photo, index })
      shortest.height += photoRatio(photo)
    })
    return cols
  }, [photos, columnCount])

  const coverAlbum = visibleAlbums.find(album => album.coverPhotoId && album.contentToken) ?? null
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
      scroller.scrollTo({ top: start.offsetTop, behavior: 'auto' })
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
    <div ref={scrollRef} className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-white text-foreground dark:bg-background">
      {/* Cover */}
      <section className="relative isolate flex h-svh min-h-[420px] w-full items-center justify-center overflow-hidden bg-neutral-900 text-white">
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
        {leadingActions && <div className="absolute left-3 top-3 sm:left-6 sm:top-5">{leadingActions}</div>}
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
          <button
            type="button"
            onClick={scrollToGallery}
            className="mt-10 border border-white/70 py-3 pl-[calc(2rem+0.3em)] pr-8 text-[11px] font-medium uppercase tracking-[0.3em] text-white transition-colors duration-200 hover:bg-white hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
          >
            {t('viewGallery')}
          </button>
        </div>
      </section>

      <div ref={galleryStartRef} />

      {/* Gallery bar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-white/90 backdrop-blur-md dark:bg-background/90">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-6 lg:px-10">
          {leadingActions}
          <BrandLogo height={24} className="hidden sm:block" />
          <div className="min-w-0 sm:border-l sm:border-border sm:pl-3">
            <p className="truncate text-xs font-medium uppercase tracking-[0.2em] sm:text-sm">{title}</p>
            {photoTotal > 0 && (
              <p className="truncate text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {t('photoCount', { count: photoTotal })}
              </p>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {trailingActions}
            {canDownload && (
              <div
                ref={downloadMenuRef}
                className="relative"
                onBlur={(e) => {
                  // Tabbing out closes the menu; clicks outside are handled by the mousedown listener
                  if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setDownloadMenuOpen(false)
                }}
              >
                <button
                  ref={downloadButtonRef}
                  type="button"
                  onClick={() => (visibleAlbums.length > 1 ? setDownloadMenuOpen(open => !open) : runDownload('album'))}
                  disabled={downloading}
                  aria-expanded={visibleAlbums.length > 1 ? downloadMenuOpen : undefined}
                  className="inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                  title={visibleAlbums.length > 1 ? tc('download') : t('downloadAlbum')}
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  <span className="hidden sm:inline">{tc('download')}</span>
                </button>
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
            {showLanguageToggle && <LanguageToggle variant="ghost" />}
            <ThemeToggle variant="ghost" />
          </div>
        </div>

        {visibleAlbums.length > 1 && (
          <nav
            ref={albumNavRef}
            aria-label={t('photoAlbums')}
            // Wrap with a mouse (no sideways wheel); touch screens swipe the strip and keep the bar short
            className="flex gap-x-6 overflow-x-auto px-3 sm:gap-x-8 sm:px-6 lg:px-10 [@media(hover:hover)]:flex-wrap [@media(hover:hover)]:overflow-visible"
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
                    '-mb-px max-w-[16rem] shrink-0 truncate border-b-2 pb-3 pt-1 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors sm:text-xs',
                    isActive
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {album.name}
                </button>
              )
            })}
          </nav>
        )}
      </header>

      {/* Grid: at least a viewport tall so switching to a shorter album never drags the cover back into view */}
      <section aria-label={selectedAlbum?.name ?? title} className="min-h-svh px-1.5 py-1.5 sm:px-6 sm:py-6 lg:px-10">
        <div ref={gridRef}>
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
              <div className="flex gap-1.5 sm:gap-3">
                {columns.map((column, columnIndex) => (
                  <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-3">
                    {column.items.map(({ photo, index }) => {
                      const isSelected = selectedIds.has(photo.id)
                      return (
                        <figure
                          key={photo.id}
                          className="group relative overflow-hidden bg-muted/50"
                          style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '1 / 1' }}
                        >
                          {photo.thumbUrl ? (
                            <button
                              type="button"
                              onClick={() => (selecting && allowPhotoDownload ? toggleSelect(photo.id) : setLightboxIndex(index))}
                              className={cn(
                                'block h-full w-full focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                                selecting && allowPhotoDownload ? 'cursor-pointer' : 'cursor-zoom-in'
                              )}
                              aria-label={photo.fileName}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo.thumbUrl}
                                alt={photo.fileName}
                                loading="lazy"
                                decoding="async"
                                className={cn(
                                  'h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out',
                                  isSelected ? 'scale-[0.94]' : 'motion-safe:group-hover:scale-[1.015]'
                                )}
                              />
                            </button>
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                              <ImageIcon className="h-5 w-5" />
                              <span className="text-xs">{t('processing')}</span>
                            </div>
                          )}

                          {/* Hover controls: hidden on touch screens, where the lightbox and the bar carry downloads */}
                          {allowPhotoDownload && photo.thumbUrl && (
                            <>
                              <div
                                className={cn(
                                  'pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/25 opacity-0 motion-safe:transition-opacity motion-safe:duration-200 [@media(hover:none)]:hidden',
                                  !isSelected && 'group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'
                                )}
                              />
                              <button
                                type="button"
                                onClick={() => toggleSelect(photo.id)}
                                aria-pressed={isSelected}
                                aria-label={`${t('selectPhoto')}: ${photo.fileName}`}
                                className={cn(
                                  'absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border motion-safe:transition-all motion-safe:duration-200 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white [@media(hover:none)]:hidden',
                                  isSelected
                                    ? 'border-foreground bg-foreground text-background opacity-100'
                                    : cn(
                                        'border-white/90 bg-black/10 text-transparent hover:bg-black/30',
                                        selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'
                                      )
                                )}
                              >
                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadPhoto(photo.id)}
                                aria-label={`${t('downloadPhoto')}: ${photo.fileName}`}
                                title={t('downloadPhoto')}
                                className="absolute bottom-2 right-2 p-1 text-white opacity-0 motion-safe:transition-opacity motion-safe:duration-200 hover:text-white/80 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 [@media(hover:none)]:hidden"
                              >
                                <Download className="h-4 w-4 drop-shadow" />
                              </button>
                            </>
                          )}
                        </figure>
                      )
                    })}
                  </div>
                ))}
              </div>
              {photos.length < totalPhotos && (
                <div ref={sentinelRef} className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
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
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-foreground py-1.5 pl-5 pr-1.5 text-background shadow-elevation-xl">
            <span className="mr-2 text-[11px] font-medium uppercase tracking-[0.2em] tabular-nums">
              {t('selectedCount', { count: selectedIds.size })}
            </span>
            <button
              type="button"
              onClick={() => runDownload('selection')}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {tc('download')}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              aria-label={tc('deselectAll')}
              title={tc('deselectAll')}
              className="rounded-full p-2 text-background/70 transition-colors hover:text-background"
            >
              <X className="h-4 w-4" />
            </button>
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
