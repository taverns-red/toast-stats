import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ColumnVisibilityApi } from '../hooks/useColumnVisibility'
import {
  ALWAYS_SHOWN_COLUMN_ID,
  CHOOSER_GROUPS,
  BASE_COLUMN_IDS,
  CHANGES_COLUMN_IDS,
  SINCE_COLUMN_ID,
  columnMeta,
} from './clubsColumnMeta'

interface ColumnsMenuProps {
  columns: ColumnVisibilityApi
  /** The Changes columns are offered (a snapshot diff is loaded). */
  changesAvailable: boolean
  /** Heading for the Changes group, e.g. "Changes since Nov 10". */
  changesLabel?: string | undefined
  /** The `?since=` preset is on, so "vs last year" is listed. */
  sinceActive: boolean
}

/** Ids offered under a group, in table order. */
const idsFor = (
  group: string,
  changesAvailable: boolean,
  sinceActive: boolean
): string[] =>
  [
    ...BASE_COLUMN_IDS,
    ...(sinceActive ? [SINCE_COLUMN_ID] : []),
    ...(changesAvailable ? CHANGES_COLUMN_IDS : []),
  ].filter(id => columnMeta[id]?.group === group)

/**
 * The Columns control for the club table (#2676, spec §4.2).
 *
 * One control at every width from 768 up, so a column the width hides is always
 * one click away. A disclosure, not a `menu`: `aria-expanded` and
 * `aria-controls`, a region of checkboxes grouped under legends. Focus moves to
 * the first checkbox on open; Escape or an outside click closes it, and Escape
 * returns focus to the trigger (WCAG 2.4.3), as the Filters drawer does.
 *
 * The trigger shows the live count ("Columns · 9 of 15") and says "(custom)"
 * when the set differs from this width's default, so a customised view is never
 * silent. A polite live region announces each toggle.
 */
export const ColumnsMenu: React.FC<ColumnsMenuProps> = ({
  columns,
  changesAvailable,
  changesLabel,
  sinceActive,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const baseId = useId()
  const popoverId = `${baseId}-columns-popover`

  const focusFirstCheckbox = useCallback(() => {
    popoverRef.current
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:disabled)')
      ?.focus()
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    focusFirstCheckbox()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [isOpen, close, focusFirstCheckbox])

  const { shownCount, totalCount, isCustom } = columns
  const accessibleName = `Columns, ${shownCount} of ${totalCount} shown${
    isCustom ? ', customised' : ''
  }`

  const onToggle = (id: string) => {
    const label = columnMeta[id]?.label ?? id
    setAnnouncement(`${label} ${columns.isVisible(id) ? 'hidden' : 'shown'}`)
    columns.toggle(id)
  }

  return (
    <div className="clubs-columns-menu">
      <button
        ref={triggerRef}
        type="button"
        className="clubs-filters-trigger"
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        aria-label={accessibleName}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 6v12M10 6v12M16 6v12M4 18h16"
          />
        </svg>
        <span>{`Columns · ${shownCount} of ${totalCount}`}</span>
        {isCustom && (
          <span className="clubs-columns-menu__custom">
            <span aria-hidden="true" className="clubs-columns-menu__dot" />
            (custom)
          </span>
        )}
      </button>

      <span className="sr-only" aria-live="polite" data-testid="columns-live">
        {announcement}
      </span>

      {isOpen && (
        <div
          ref={popoverRef}
          id={popoverId}
          className="clubs-columns-menu__popover"
          role="group"
          aria-label="Choose columns"
        >
          {CHOOSER_GROUPS.map(group => {
            const ids = idsFor(group.id, changesAvailable, sinceActive)
            if (ids.length === 0) return null
            const legend =
              group.id === 'changes' && changesLabel
                ? changesLabel
                : group.label
            return (
              <fieldset key={group.id} className="clubs-columns-menu__group">
                <legend className="clubs-columns-menu__legend">{legend}</legend>
                {ids.map(id => {
                  const meta = columnMeta[id]
                  if (!meta) return null
                  const isRevealed = columns.revealed.has(id)
                  const locked =
                    id === ALWAYS_SHOWN_COLUMN_ID ||
                    id === SINCE_COLUMN_ID ||
                    isRevealed
                  const hintId = `${baseId}-hint-${id}`
                  return (
                    <div key={id} className="clubs-columns-menu__row">
                      <label className="clubs-columns-menu__item">
                        <input
                          type="checkbox"
                          checked={columns.isVisible(id)}
                          disabled={locked}
                          aria-describedby={hintId}
                          onChange={() => onToggle(id)}
                        />
                        <span>{meta.label}</span>
                      </label>
                      <span id={hintId} className="clubs-columns-menu__hint">
                        {meta.hint}
                      </span>
                      {id === ALWAYS_SHOWN_COLUMN_ID && (
                        <span className="clubs-columns-menu__note">
                          Always shown
                        </span>
                      )}
                      {isRevealed && (
                        <span className="clubs-columns-menu__note">
                          Shown while sorted or filtered by it
                        </span>
                      )}
                      {id === SINCE_COLUMN_ID && (
                        <span className="clubs-columns-menu__note">
                          Shown while &lsquo;DCP since last year&rsquo; is set
                        </span>
                      )}
                    </div>
                  )
                })}
              </fieldset>
            )
          })}
          <div className="clubs-columns-menu__footer">
            <button
              type="button"
              className="clubs-columns-menu__action"
              onClick={() => {
                columns.showAll()
                setAnnouncement('All columns shown')
              }}
            >
              Show all
            </button>
            <button
              type="button"
              className="clubs-columns-menu__action"
              disabled={!isCustom}
              onClick={() => {
                columns.reset()
                setAnnouncement('Columns reset to default')
                // The button disables once the set is the default; keep focus
                // inside the popover rather than dropping it to the page.
                focusFirstCheckbox()
              }}
            >
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
