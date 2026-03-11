'use client'

import { useEffect, useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { driver, type DriveStep, type Config } from 'driver.js'
import 'driver.js/dist/driver.css'
import { HelpCircle } from 'lucide-react'

interface ShareTutorialProps {
  projectId: string
  showTutorial: boolean
  watermarkEnabled?: boolean
  hideFeedback?: boolean
  clientCanApprove?: boolean
  allowAssetDownload?: boolean
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
  isGuest = false,
  inPlayerView,
}: ShareTutorialProps) {
  const t = useTranslations('tutorial')
  const [hasCompleted, setHasCompleted] = useState(true) // default true to avoid flash

  const storageKey = `vt-tutorial-${projectId}`

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasCompleted(localStorage.getItem(storageKey) === 'done')
    }
  }, [storageKey])

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

      // Target the thumbnail grid
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
    } else {
      // Player view steps
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

      const versionsEl = document.querySelector('[data-tutorial="version-selector"]')
      if (versionsEl) {
        steps.push({
          element: '[data-tutorial="version-selector"]',
          popover: {
            title: t('versionsTitle'),
            description: t('versionsDescription'),
          },
        })
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

      if (clientCanApprove && !isGuest) {
        steps.push({
          element: '[data-tutorial="video-player"]',
          popover: {
            title: t('approveTitle'),
            description: t('approveDescription'),
          },
        })
      }

      if (allowAssetDownload && !isGuest) {
        steps.push({
          element: '[data-tutorial="video-player"]',
          popover: {
            title: t('downloadTitle'),
            description: t('downloadDescription'),
          },
        })
      }
    }

    // Final step
    steps.push({
      popover: {
        title: t('doneTitle'),
        description: t('doneDescription'),
      },
    })

    return steps
  }, [inPlayerView, watermarkEnabled, hideFeedback, clientCanApprove, allowAssetDownload, isGuest, t])

  const startTutorial = useCallback(() => {
    const steps = buildSteps()
    if (steps.length === 0) return

    const config: Config = {
      showProgress: true,
      steps,
      nextBtnText: t('next'),
      prevBtnText: t('previous'),
      doneBtnText: t('done'),
      progressText: t('stepOf', { current: '{{current}}', total: '{{total}}' }),
      allowClose: true,
      overlayColor: 'rgba(0, 0, 0, 0.6)',
      stagePadding: 8,
      stageRadius: 8,
      popoverOffset: 12,
      onDestroyStarted: () => {
        localStorage.setItem(storageKey, 'done')
        setHasCompleted(true)
        driverObj.destroy()
      },
    }

    const driverObj = driver(config)
    driverObj.drive()
  }, [buildSteps, storageKey, t])

  // Auto-start on first visit (grid view only, with delay for page to render)
  useEffect(() => {
    if (!showTutorial || hasCompleted || inPlayerView) return

    const timer = setTimeout(() => {
      startTutorial()
    }, 800)

    return () => clearTimeout(timer)
  }, [showTutorial, hasCompleted, inPlayerView, startTutorial])

  // Don't render button if tutorial disabled or guest
  if (!showTutorial || isGuest) return null

  return (
    <button
      type="button"
      onClick={startTutorial}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-card/80 backdrop-blur border border-border rounded-lg transition-colors"
      title={t('replayTutorial')}
    >
      <HelpCircle className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{t('replayTutorial')}</span>
    </button>
  )
}
