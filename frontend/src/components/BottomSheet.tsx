import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SWIPE_CLOSE_PX } from '../utils/contextBar'

/* Bottom sheet primitive (#1831, mobile epic #1827 Phase 1).

   The phone's modal surface: it slides up from the bottom edge, holds a
   short list of controls, and is dismissed by the close button, Escape, a
   backdrop tap or a downward swipe on the grab handle. The swipe is an
   alternative, never the only path — the close button is always visible.

   Same modal contract as `ChartExpandSheet` / `FiltersPanel` (#816): portalled
   to <body>, `role="dialog"` + `aria-modal`, focus moved in on open and
   trapped on Tab, background scroll locked. Focus returns to the opener with
   `preventScroll` (Lesson 139) so closing never yanks the page back to a
   trigger near the top. Built to be shared: the context bar's sheet here and
   the section bar's "More" sheet (#1832) use the same component. */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'

export interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  /** Heading shown in the sheet header (also the dialog's accessible name). */
  title: string
  children: React.ReactNode
  /** Accessible label for the close button. */
  closeLabel?: string
  /** DOM id for the dialog, so a trigger can point `aria-controls` at it. */
  id?: string
  /** 'full' fills the viewport (#1834's full-table sheet). Default: partial. */
  variant?: 'default' | 'full'
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  closeLabel = 'Close',
  id,
  variant = 'default',
}) => {
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dragStartY = useRef<number | null>(null)
  const titleId = useId()

  // Escape closes (document-level, so it works before focus lands inside).
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  // Focus in on open, trap Tab, restore to the opener without scrolling.
  useEffect(() => {
    if (!isOpen) return
    const opener = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    const sheet = sheetRef.current
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !sheet) return
      const focusables = sheet.querySelectorAll<HTMLElement>(FOCUSABLE)
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
    sheet?.addEventListener('keydown', handleTab)
    return () => {
      sheet?.removeEventListener('keydown', handleTab)
      opener?.focus?.({ preventScroll: true })
    }
  }, [isOpen])

  // Lock background scroll while open.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!isOpen) return null

  const onHandlePointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY
  }
  const onHandlePointerUp = (e: React.PointerEvent) => {
    const start = dragStartY.current
    dragStartY.current = null
    if (start !== null && e.clientY - start >= SWIPE_CLOSE_PX) onClose()
  }

  return createPortal(
    <div className="bottom-sheet-overlay">
      <div
        className="bottom-sheet-backdrop"
        data-testid="bottom-sheet-backdrop"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        id={id}
        className={`bottom-sheet${variant === 'full' ? ' bottom-sheet--full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div
          className="bottom-sheet__handle"
          data-testid="bottom-sheet-handle"
          aria-hidden="true"
          onPointerDown={onHandlePointerDown}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={() => {
            dragStartY.current = null
          }}
        >
          <span className="bottom-sheet__grip" />
        </div>
        <div className="bottom-sheet__header">
          <h2 id={titleId} className="bottom-sheet__title">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="bottom-sheet__close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="bottom-sheet__body">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export default BottomSheet
