'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { driver, type DriveStep, type Config } from 'driver.js'
import 'driver.js/dist/driver.css'
import { HelpCircle } from 'lucide-react'

/** Steps that may appear after the main tutorial (conditional on video state) */
const DEFERRED_STEPS = ['version-selector', 'download-btn', 'approve-btn'] as const

interface ShareTutorialProps {
  projectId: string
  showTutorial: boolean
  watermarkEnabled?: boolean
  hideFeedback?: boolean
  clientCanApprove?: boolean
  allowAssetDownload?: boolean
  allowReverseShare?: boolean
  isGuest?: boolean
  /** Whether the player view is active (vs grid view) */
  inPlayerView: boolean
}

export function ShareTutorial({
  projectId,
  showTutorial,
  watermarkEnabled = true,
  hideFeedback = false,
  clientCanApprove = true,
  allowAssetDownload = true,
  allowReverseShare = false,
  isGuest = false,
  inPlayerView,
}: ShareTutorialProps) {
  const t = useTranslations('tutorial')
  const [hasCompleted, setHasCompleted] = useState(true) // default true to avoid flash
  const deferredRunningRef = useRef(false)

  const storageKey = `vt-tutorial-${inPlayerView ? 'player' : 'grid'}-${projectId}`
  const stepKey = useCallback((step: string) => `vt-tutorial-step-${step}-${projectId}`, [projectId])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasCompleted(localStorage.getItem(storageKey) === 'done')
    }
  }, [storageKey])

  /** Build a single step definition for a given tutorial element */
  const buildStepForElement = useCallback((id: string): DriveStep | null => {
    const map: Record<string, { title: string; description: string }> = {
      'version-selector': { title: t('versionsTitle'), description: t('versionsDescription') },
      'download-btn': { title: t('downloadTitle'), description: t('downloadDescription') },
      'approve-btn': { title: t('approveTitle'), description: t('approveDescription') },
    }
    const info = map[id]
    if (!info) return null
    return {
      element: `[data-tutorial="${id}"]`,
      popover: { title: info.title, description: info.description },
    }
  }, [t])

  const buildSteps = useCallback((): DriveStep[] => {
    const steps: DriveStep[] = []

    if (!inPlayerView) {
      // Grid view steps
      steps.push({
        popover: {
          title: t('welcomeTitle'),
          description: t('welcomeDescription'),
        },
      })

      const gridEl = document.querySelector('[data-tutorial="video-grid"]')
      if (gridEl) {
        steps.push({
          element: '[data-tutorial="video-grid"]',
          popover: {
            title: t('gridTitle'),
            description: t('gridDescription'),
          },
        })
      }

      if (!isGuest && (allowAssetDownload || allowReverseShare)) {
        const actionsEl = document.querySelector('[data-tutorial="grid-actions"]')
        if (actionsEl) {
          steps.push({
            element: '[data-tutorial="grid-actions"]',
            popover: {
              title: t('gridActionsTitle'),
              description: t('gridActionsDescription'),
            },
          })
        }
      }
    } else {
      // Player view steps

      // Video reel navigation — left arrow, center selector, right arrow
      const reelPrevEl = document.querySelector('[data-tutorial="video-reel-prev"]')
      if (reelPrevEl) {
        steps.push({
          element: '[data-tutorial="video-reel-prev"]',
          popover: {
            title: t('reelPrevTitle'),
            description: t('reelPrevDescription'),
          },
        })
      }

      const reelCenterEl = document.querySelector('[data-tutorial="video-reel-center"]')
      if (reelCenterEl) {
        steps.push({
          element: '[data-tutorial="video-reel-center"]',
          popover: {
            title: t('reelCenterTitle'),
            description: t('reelCenterDescription'),
          },
        })
      }

      const reelNextEl = document.querySelector('[data-tutorial="video-reel-next"]')
      if (reelNextEl) {
        steps.push({
          element: '[data-tutorial="video-reel-next"]',
          popover: {
            title: t('reelNextTitle'),
            description: t('reelNextDescription'),
          },
        })
      }

      const playerEl = document.querySelector('[data-tutorial="video-player"]')
      if (playerEl) {
        steps.push({
          element: '[data-tutorial="video-player"]',
          popover: {
            title: t('playerTitle'),
            description: t('playerDescription'),
          },
        })
      }

      // Version selector (only visible when 2+ versions exist)
      const versionsEl = document.querySelector('[data-tutorial="version-selector"]')
      if (versionsEl) {
        steps.push({
          element: '[data-tutorial="version-selector"]',
          popover: {
            title: t('versionsTitle'),
            description: t('versionsDescription'),
          },
        })
        localStorage.setItem(stepKey('version-selector'), 'done')
      }

      if (watermarkEnabled) {
        steps.push({
          element: '[data-tutorial="video-player"]',
          popover: {
            title: t('watermarkTitle'),
            description: t('watermarkDescription'),
          },
        })
      }

      // Info button
      const infoBtn = document.querySelector('[data-tutorial="info-btn"]')
      if (infoBtn) {
        steps.push({
          element: '[data-tutorial="info-btn"]',
          popover: {
            title: t('infoTitle'),
            description: t('infoDescription'),
          },
        })
      }

      if (!hideFeedback && !isGuest) {
        const commentsEl = document.querySelector('[data-tutorial="comments"]')
        if (commentsEl) {
          steps.push({
            element: '[data-tutorial="comments"]',
            popover: {
              title: t('commentsTitle'),
              description: t('commentsDescription'),
            },
          })
        }
      }

      // Approve button (only visible when video is not yet approved)
      if (clientCanApprove && !isGuest) {
        const approveBtn = document.querySelector('[data-tutorial="approve-btn"]')
        if (approveBtn) {
          steps.push({
            element: '[data-tutorial="approve-btn"]',
            popover: {
              title: t('approveTitle'),
              description: t('approveDescription'),
            },
          })
          localStorage.setItem(stepKey('approve-btn'), 'done')
        }
      }

      // Download button (only visible when video is approved)
      if (allowAssetDownload && !isGuest) {
        const downloadBtn = document.querySelector('[data-tutorial="download-btn"]')
        if (downloadBtn) {
          steps.push({
            element: '[data-tutorial="download-btn"]',
            popover: {
              title: t('downloadTitle'),
              description: t('downloadDescription'),
            },
          })
          localStorage.setItem(stepKey('download-btn'), 'done')
        }
      }
    }

    // Final step
    steps.push({
      popover: {
        title: t('doneTitle'),
        description: `${t('doneDescription')} <a href="https://github.com/MansiVisuals/ViTransfer/wiki/Client-Guide" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;opacity:0.8">${t('doneLearnMore')}</a>`,
      },
    })

    return steps
  }, [inPlayerView, watermarkEnabled, hideFeedback, clientCanApprove, allowAssetDownload, allowReverseShare, isGuest, t, stepKey])

  const runDriver = useCallback((steps: DriveStep[], onComplete?: () => void) => {
    if (steps.length === 0) return

    const config: Config = {
      showProgress: true,
      steps,
      nextBtnText: t('next'),
      prevBtnText: t('previous'),
      doneBtnText: t('done'),
      progressText: t('stepOf', { current: '{{current}}', total: '{{total}}' }),
      allowClose: false,
      disableActiveInteraction: true,
      overlayColor: 'rgba(0, 0, 0, 0.6)',
      stagePadding: 8,
      stageRadius: 8,
      popoverOffset: 12,
      onDestroyStarted: () => {
        onComplete?.()
        driverObj.destroy()
      },
    }

    const driverObj = driver(config)
    driverObj.drive()
  }, [t])

  const startTutorial = useCallback(() => {
    const steps = buildSteps()
    if (steps.length === 0) return

    runDriver(steps, () => {
      localStorage.setItem(storageKey, 'done')
      setHasCompleted(true)
    })
  }, [buildSteps, runDriver, storageKey])

  // Auto-start on first visit (both grid and player views, with delay for page to render)
  useEffect(() => {
    if (!showTutorial || hasCompleted) return

    const timer = setTimeout(() => {
      startTutorial()
    }, inPlayerView ? 1200 : 800)

    return () => clearTimeout(timer)
  }, [showTutorial, hasCompleted, inPlayerView, startTutorial])

  // Watch for deferred elements that appear after the main tutorial is done
  // (e.g. version selector when v2 is uploaded, download button after approval)
  useEffect(() => {
    if (!showTutorial || !hasCompleted || !inPlayerView || isGuest) return

    const checkDeferred = () => {
      if (deferredRunningRef.current) return

      for (const step of DEFERRED_STEPS) {
        // Skip steps the user has already seen
        if (localStorage.getItem(stepKey(step)) === 'done') continue

        // Skip steps that don't apply to this project config
        if (step === 'approve-btn' && !clientCanApprove) continue
        if (step === 'download-btn' && !allowAssetDownload) continue

        const el = document.querySelector(`[data-tutorial="${step}"]`)
        if (el) {
          const built = buildStepForElement(step)
          if (!built) continue

          deferredRunningRef.current = true
          runDriver([built], () => {
            localStorage.setItem(stepKey(step), 'done')
            deferredRunningRef.current = false
          })
          break // one at a time
        }
      }
    }

    // Initial check after a delay (element may already be present)
    const timer = setTimeout(checkDeferred, 1500)

    // Watch for DOM changes (element appearing after state change)
    const observer = new MutationObserver(() => {
      checkDeferred()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [showTutorial, hasCompleted, inPlayerView, isGuest, clientCanApprove, allowAssetDownload, stepKey, buildStepForElement, runDriver])

  // Don't render button if tutorial disabled or guest
  if (!showTutorial || isGuest) return null

  return (
    <button
      type="button"
      onClick={startTutorial}
      className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors shadow-sm"
      aria-label={t('replayTutorial')}
      title={t('replayTutorial')}
    >
      <HelpCircle className="h-5 w-5 text-foreground" />
    </button>
  )
}
