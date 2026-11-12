import { useEffect, useRef, type RefObject } from 'react'
import { lockScroll as lockPageScroll } from '../utils/scrollLock'

/* WAI-ARIA dialog behaviour for a surface that is not a BottomSheet (#2638):
   Tab wraps inside the container, Escape closes from anywhere (document-level,
   so it works wherever focus is), page scroll is locked, and focus returns to
   the opener on close without scrolling (Lesson 139). The opener is whatever
   had focus when the dialog opened, or `returnFocusRef` when given (WebKit
   never focuses a <button> on tap, #1920). */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'

export interface DialogBehaviorOptions {
  /** Only active while true. */
  active: boolean
  onClose: () => void
  /** Wraps Tab inside this element. Omit for scroll lock + Escape only. */
  containerRef?: RefObject<HTMLElement | null>
  /** Where focus goes on close. Default: the element focused at open. */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Lock page scroll while active. Default true. */
  lockScroll?: boolean
}

export function useDialogBehavior({
  active,
  onClose,
  containerRef,
  returnFocusRef,
  lockScroll = true,
}: DialogBehaviorOptions): void {
  // Latest onClose without re-running the effect: a re-run would restore
  // focus to the opener while the dialog is still open.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!active) return
    const opener =
      returnFocusRef?.current ?? (document.activeElement as HTMLElement | null)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const container = containerRef?.current
      if (!container) return
      const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE)
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener && opener !== document.body && document.contains(opener)) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [active, containerRef, returnFocusRef])

  useEffect(() => {
    if (!active || !lockScroll) return
    return lockPageScroll()
  }, [active, lockScroll])
}
