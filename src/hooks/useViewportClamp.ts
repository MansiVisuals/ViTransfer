import { useEffect, type RefObject } from 'react'

/**
 * After `open` becomes true, nudge the referenced element horizontally so it
 * stays within the viewport with `padding`px of breathing room on either side.
 * Useful for absolutely-positioned dropdowns that would otherwise overflow.
 */
export function useViewportClamp(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  padding: number = 8
) {
  useEffect(() => {
    const el = ref.current
    if (!open || !el) return
    el.style.transform = ''
    const rect = el.getBoundingClientRect()
    if (rect.left < padding) {
      el.style.transform = `translateX(${padding - rect.left}px)`
    } else if (rect.right > window.innerWidth - padding) {
      el.style.transform = `translateX(${window.innerWidth - padding - rect.right}px)`
    }
  }, [ref, open, padding])
}
