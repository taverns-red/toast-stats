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

/**
 * What the menu lists, for a table other than the Clubs one (#2689). Omit it
 * for the Clubs table, whose groups and columns come from `clubsColumnMeta`.
 */
export interface ColumnsMenuSpec {
  groups: readonly { id: string; label: string }[]
  /** Offered column ids, in table order. */
  ids: readonly string[]
  meta: Readonly<Record<string, { group: string; label: string; hint: string }>>
  /** Ids shown at every width; listed, checked and locked. */
  alwaysShown: readonly string[]
}

interface ColumnsMenuProps {
  columns: ColumnVisibilityApi
  /** The Changes columns are offered (a snapshot diff is loaded). */
  changesAvailable?: boolean
  /** The Changes diff is being fetched; the group says so (#2740). */
  changesLoading?: boolean
  /** Called when the menu opens (starts the on-demand diff read, #2740). */
  onOpen?: (() => void) | undefined
  /** Heading for the Changes group, e.g. "Changes since Nov 10". */
  changesLabel?: string | undefined
  /** The `?since=` preset is on, so "vs last year" is listed. */
  sinceActive?: boolean
  spec?: ColumnsMenuSpec
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
  changesAvailable = false,
  changesLoading = false,
  onOpen,
  changesLabel,
  sinceActive = false,
  spec,
}) => {
  const groups = spec?.groups ?? CHOOSER_GROUPS
  const metaOf = (id: string) => (spec?.meta ?? columnMeta)[id]
  const isAlwaysShown = (id: string) =>
    spec ? spec.alwaysShown.includes(id) : id === ALWAYS_SHOWN_COLUMN_ID
  const idsOf = (group: string): string[] =>
    spec
      ? spec.ids.filter(id => spec.meta[id]?.group === group)
      : idsFor(group, changesAvailable, sinceActive)
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
    onOpen?.()
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
  }, [isOpen, close, focusFirstCheckbox, onOpen])

  const { shownCount, totalCount, isCustom } = columns
  const accessibleName = `Columns, ${shownCount} of ${totalCount} shown${
    isCustom ? ', customised' : ''
  }`

  const onToggle = (id: string, input: HTMLInputElement) => {
    const label = metaOf(id)?.label ?? id
    if (columns.isVisible(id) && columns.needed.has(id)) {
      // The table is sorted or filtered by this column, so unchecking saves
      // the choice but hides nothing yet, and the box turns into a locked one.
      // Move focus to an enabled neighbour first so it is not dropped.
      const all = Array.from(
        popoverRef.current?.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]'
        ) ?? []
      )
      const enabled = all.filter(b => b !== input && !b.disabled)
      const next =
        enabled.find(b => all.indexOf(b) > all.indexOf(input)) ??
        enabled[enabled.length - 1]
      next?.focus({ preventScroll: true })
      setAnnouncement(`${label} stays shown while sorted or filtered by it`)
    } else {
      setAnnouncement(`${label} ${columns.isVisible(id) ? 'hidden' : 'shown'}`)
    }
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
          {groups.map(group => {
            const ids = idsOf(group.id)
            if (ids.length === 0) return null
            const legend =
              group.id === 'changes' && changesLabel
                ? changesLabel
                : group.label
            return (
              <fieldset key={group.id} className="clubs-columns-menu__group">
                <legend className="clubs-columns-menu__legend">{legend}</legend>
                {group.id === 'changes' && changesLoading && (
                  <span
                    className="clubs-columns-menu__note"
                    role="status"
                    aria-live="polite"
                  >
                    Loading changes…
                  </span>
                )}
                {ids.map(id => {
                  const meta = metaOf(id)
                  if (!meta) return null
                  const isRevealed = columns.revealed.has(id)
                  const always = isAlwaysShown(id)
                  const locked = always || id === SINCE_COLUMN_ID || isRevealed
                  const hintId = `${baseId}-hint-${id}`
                  const noteId = `${baseId}-note-${id}`
                  const hasNote = always || id === SINCE_COLUMN_ID || isRevealed
                  return (
                    <div key={id} className="clubs-columns-menu__row">
                      <label className="clubs-columns-menu__item">
                        <input
                          type="checkbox"
                          checked={columns.isVisible(id)}
                          disabled={locked}
                          aria-describedby={
                            hasNote ? `${hintId} ${noteId}` : hintId
                          }
                          onChange={e => onToggle(id, e.currentTarget)}
                        />
                        <span>{meta.label}</span>
                      </label>
                      <span id={hintId} className="clubs-columns-menu__hint">
                        {meta.hint}
                      </span>
                      {always && (
                        <span id={noteId} className="clubs-columns-menu__note">
                          Always shown
                        </span>
                      )}
                      {isRevealed && (
                        <span id={noteId} className="clubs-columns-menu__note">
                          Shown while sorted or filtered by it
                        </span>
                      )}
                      {id === SINCE_COLUMN_ID && (
                        <span id={noteId} className="clubs-columns-menu__note">
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
