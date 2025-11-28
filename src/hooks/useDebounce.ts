import { useRef, useCallback } from 'react'

/**
 * Custom hook for debouncing function calls
 * Prevents rapid successive calls that could cause UI freezing
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isExecutingRef = useRef(false)

  return useCallback(
    (...args: Parameters<T>) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Prevent execution if already running
      if (isExecutingRef.current) {
        return
      }

      timeoutRef.current = setTimeout(async () => {
        isExecutingRef.current = true
        try {
          await callback(...args)
        } finally {
          isExecutingRef.current = false
        }
      }, delay)
    },
    [callback, delay]
  )
}

/**
 * Hook for preventing double-clicks on async actions
 * Returns a wrapped function that prevents concurrent executions
 */
export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
  action: T
): [(...args: Parameters<T>) => Promise<void>, boolean] {
  const isExecutingRef = useRef(false)

  const wrappedAction = useCallback(
    async (...args: Parameters<T>) => {
      if (isExecutingRef.current) {
        return
      }

      isExecutingRef.current = true
      try {
        await action(...args)
      } finally {
        isExecutingRef.current = false
      }
    },
    [action]
  )

  return [wrappedAction, isExecutingRef.current]
}
