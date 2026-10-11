/* MobileRowList (#1833, mobile epic #1827 Phase 1 — primitive).
 *
 * The phone pattern for "browse one entity at a time" data (review §5.2,
 * Lesson 105): a compact row instead of a 125–140 px card or an overflowing
 * table. Each row is
 *
 *   line 1  name (ellipsizes) ............ status chip (never shrinks)   ›
 *   line 2  two or three key numbers
 *
 * and the WHOLE row is one real <Link> to the entity's routed page (ADR-005,
 * CC-7), so long-press / open-in-new-tab work and there is no nested control.
 * Rows are 56–64 px (CSS contract in mobile-row-list.css). The chip is passed
 * in by the caller and must carry a glyph or text, not colour alone.
 *
 * Long lists: `groups` render as collapsed-by-default disclosure headers with
 * row counts (open state controlled by the caller so it can live in the URL,
 * R3 — or uncontrolled when the caller passes nothing); any list over 50 rows
 * shows 50, then "Show 25 more". Desktop callers keep their tables — this is
 * mounted only below 768 (`useIsMobile(768)`).
 */

import React, { useCallback, useId, useState } from 'react'
import { Link } from 'react-router-dom'

export interface MobileRow {
  /** Stable key. */
  id: string
  /** Routed destination for the whole row. */
  to: string
  /** Router location state for the destination (e.g. back-link context). */
  state?: unknown
  /** Line 1: the entity's name. */
  title: string
  /** Line 1, right: status chip (glyph/text + colour, never colour alone). */
  chip?: React.ReactNode
  /** Line 2: two or three key numbers. */
  meta?: React.ReactNode
  /** Optional trailing visual before the chevron (e.g. a sparkline). */
  trailing?: React.ReactNode
  /** Accessible name override; defaults to the row's text content. */
  ariaLabel?: string
  /** DOM id on the row link (e.g. a deep-link scroll target). */
  domId?: string
  /** Marks the row as the current item (`aria-current` + highlight). */
  current?: boolean
}

export interface MobileRowGroup {
  id: string
  label: string
  rows: MobileRow[]
  /** Short status summary shown beside the count (e.g. "✗ 2 · ⚠ 3"). */
  summary?: string
}

interface MobileRowListProps {
  /** Accessible name of the list (or group set). */
  label: string
  /** Plural noun for the "Show N more …" control. */
  noun?: string
  /** Flat rows. Ignored when `groups` is provided. */
  rows?: MobileRow[]
  /** Grouped rows — collapsed by default. */
  groups?: MobileRowGroup[]
  /** Controlled open groups. Omit for uncontrolled (local) state. */
  openGroupIds?: readonly string[]
  /** Called with a group id when its header is tapped (controlled mode). */
  onToggleGroup?: (id: string) => void
  /**
   * Where the chip sits. `'title'` (default) puts it beside the name on line 1
   * — right for short names (divisions). `'meta'` leads line 2 with it so a
   * long name (clubs) keeps the whole first line at 375 px.
   */
  chipPlacement?: 'title' | 'meta'
  /** Drop side borders/radius so the list can bleed to its panel's edges. */
  flush?: boolean
  /**
   * Row id that must be rendered even past the 50-row cap (e.g. a
   * `?highlight=` deep link) — the list reveals far enough to include it.
   */
  revealRowId?: string | undefined
}

export const INITIAL_VISIBLE_ROWS = 50
export const SHOW_MORE_STEP = 25

export const Chevron: React.FC<{ className: string }> = ({ className }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M6 3l5 5-5 5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

type ChipPlacement = 'title' | 'meta'

const RowItem: React.FC<{ row: MobileRow; chipPlacement: ChipPlacement }> = ({
  row,
  chipPlacement,
}) => {
  const chip = row.chip != null && (
    <span className="mobile-row__chip">{row.chip}</span>
  )
  return (
    <li>
      <Link
        to={row.to}
        state={row.state}
        className={`mobile-row${row.current ? ' mobile-row--current' : ''}`}
        data-testid="mobile-row"
        aria-label={row.ariaLabel}
        id={row.domId}
        aria-current={row.current ? 'true' : undefined}
      >
        <span className="mobile-row__body">
          <span className="mobile-row__line1">
            <span className="mobile-row__title">{row.title}</span>
            {chipPlacement === 'title' && chip}
          </span>
          {(row.meta != null || chipPlacement === 'meta') && (
            <span className="mobile-row__line2">
              {chipPlacement === 'meta' && chip}
              {row.meta != null && (
                <span className="mobile-row__meta">{row.meta}</span>
              )}
            </span>
          )}
        </span>
        {row.trailing != null && (
          <span className="mobile-row__trailing">{row.trailing}</span>
        )}
        <Chevron className="mobile-row__chevron" />
      </Link>
    </li>
  )
}

/** A list of rows with the 50 → +25 "show more" step. */
const RowBlock: React.FC<{
  rows: MobileRow[]
  noun: string
  label?: string
  id?: string
  chipPlacement: ChipPlacement
  revealRowId?: string | undefined
}> = ({ rows, noun, label, id, chipPlacement, revealRowId }) => {
  const [shown, setVisible] = useState(INITIAL_VISIBLE_ROWS)
  // A deep-linked row past the cap is revealed (derived, so it also holds
  // when the rows arrive after the first render).
  const revealIndex = revealRowId
    ? rows.findIndex(r => r.id === revealRowId)
    : -1
  const visible = Math.max(shown, revealIndex + 1)
  const remaining = rows.length - visible
  const next = Math.min(SHOW_MORE_STEP, remaining)
  return (
    <>
      <ul className="mobile-row-list__rows" aria-label={label} id={id}>
        {rows.slice(0, visible).map(row => (
          <RowItem key={row.id} row={row} chipPlacement={chipPlacement} />
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          className="mobile-row-list__more"
          onClick={() => setVisible(visible + SHOW_MORE_STEP)}
        >
          Show {next} more {noun}
          <span className="mobile-row-list__more-count">
            {' '}
            ({remaining} hidden)
          </span>
        </button>
      )}
    </>
  )
}

export const MobileRowList: React.FC<MobileRowListProps> = ({
  label,
  noun = 'rows',
  rows = [],
  groups,
  openGroupIds,
  onToggleGroup,
  chipPlacement = 'title',
  flush = false,
  revealRowId,
}) => {
  const rootClass = `mobile-row-list${flush ? ' mobile-row-list--flush' : ''}`
  const baseId = useId()
  const [localOpen, setLocalOpen] = useState<readonly string[]>([])
  const controlled = openGroupIds !== undefined
  const open = controlled ? openGroupIds : localOpen

  const toggle = useCallback(
    (id: string) => {
      if (controlled) {
        onToggleGroup?.(id)
        return
      }
      setLocalOpen(prev =>
        prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
      )
      onToggleGroup?.(id)
    },
    [controlled, onToggleGroup]
  )

  if (!groups) {
    return (
      <div className={rootClass}>
        <RowBlock
          rows={rows}
          noun={noun}
          label={label}
          chipPlacement={chipPlacement}
          revealRowId={revealRowId}
        />
      </div>
    )
  }

  return (
    <div className={rootClass} role="group" aria-label={label}>
      {groups.map((group, i) => {
        const isOpen = open.includes(group.id)
        const panelId = `${baseId}-g${i}`
        return (
          <section className="mobile-row-group" key={group.id}>
            <h3 className="mobile-row-group__heading">
              <button
                type="button"
                className="mobile-row-group__toggle"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(group.id)}
              >
                <Chevron
                  className={`mobile-row-group__chevron${
                    isOpen ? ' mobile-row-group__chevron--open' : ''
                  }`}
                />
                <span className="mobile-row-group__label">{group.label}</span>
                {group.summary && (
                  <span className="mobile-row-group__summary">
                    {group.summary}
                  </span>
                )}
                <span className="mobile-row-group__count">
                  {group.rows.length}
                  <span className="sr-only"> {noun}</span>
                </span>
              </button>
            </h3>
            <div id={panelId} hidden={!isOpen}>
              {isOpen && (
                <RowBlock
                  rows={group.rows}
                  noun={noun}
                  label={`${group.label} ${noun}`}
                  chipPlacement={chipPlacement}
                />
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default MobileRowList
