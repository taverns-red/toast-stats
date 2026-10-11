import React, { useCallback, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'
import { formatShortDate } from '../utils/dateFormatting'
import { formatPyCompact } from '../utils/contextBar'
import type { ProgramYear } from '../utils/programYear'

/* Phone context bar (#1831, mobile epic #1827 Phase 1, review §5.1).

   One 44px sticky row below 768 that replaces the entity header stack
   (eyebrow + title + lede + data chips + "⋯" + breadcrumb):

     ‹  District 61                 PY 26–27 · Oct 10 ▾

   - The leading "‹" goes ONE level back (never a wrapped trail).
   - The chip opens a bottom sheet holding the page's controls (PY, date),
     its actions (Export, Share), "About this page" (the lede) and the full
     trail.
   - The H1 stays in the page header for a11y/SEO; this bar's title is
     presentational (aria-hidden) so a screen reader hears the name once.
   - Program year and date are PROPS (R3) — the bar never derives them. The
     page owns their URL state and passes the setters into the sheet.

   Entity-agnostic so district, division, area, club, region and world pages
   share it (district routes first). Hidden from 768 up by CSS, where the
   desktop header is unchanged. The bottom section bar (#1832) is a separate
   fixed-bottom element; the two never overlap. */

export interface ContextCrumb {
  label: string
  /** Omit on the final crumb (the current page). */
  to?: string
}

export interface ContextBarProps {
  /** Entity name shown in the bar (e.g. "District 61"). */
  title: string
  /** One level up. Omitted on a root page. */
  back?: { label: string; to: string } | undefined
  /** The selected program year (R3: a prop, owned by the page). Omit on a
   * page with no PY/date state; the chip then shows `chipLabel`. */
  programYear?: ProgramYear | undefined
  /** The snapshot date being viewed; undefined renders "Latest". */
  date?: string | undefined
  /** Chip text when there is no program year (default "Page info"). */
  chipLabel?: string
  /** PY / date controls rendered at the top of the sheet. */
  controls?: React.ReactNode
  /** Page actions (Export, Share…) rendered under the controls. */
  actions?: React.ReactNode
  /** "About this page" copy — the desktop lede. */
  about?: React.ReactNode
  /** The full breadcrumb trail, root first, current page last. */
  trail?: ContextCrumb[]
}

export const ContextBar: React.FC<ContextBarProps> = ({
  title,
  back,
  programYear,
  date,
  chipLabel = 'Page info',
  controls,
  actions,
  about,
  trail,
}) => {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const sheetId = useId()
  const dateLabel = date ? formatShortDate(date) : 'Latest'
  const chipText = programYear
    ? `${formatPyCompact(programYear)} · ${dateLabel}`
    : chipLabel

  return (
    <div className="context-bar" data-testid="context-bar">
      {back ? (
        <Link
          to={back.to}
          className="context-bar__back"
          aria-label={`Back to ${back.label}`}
          data-testid="context-bar-back"
        >
          <span aria-hidden="true">‹</span>
        </Link>
      ) : (
        <span className="context-bar__back-spacer" aria-hidden="true" />
      )}
      <span className="context-bar__title" aria-hidden="true">
        {title}
      </span>
      <button
        type="button"
        className="context-bar__chip"
        data-testid="context-bar-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? sheetId : undefined}
        aria-label={`${chipText}. Page options`}
        onClick={() => setOpen(true)}
      >
        {/* The button is the 44px hit area; the pill inside is the visual,
            so the chip sits inside the 44px bar instead of filling it. */}
        <span className="context-bar__pill">
          <span>{chipText}</span>
          <span aria-hidden="true" className="context-bar__caret">
            ▾
          </span>
        </span>
      </button>

      <BottomSheet
        id={sheetId}
        isOpen={open}
        onClose={close}
        title={title}
        closeLabel="Close page options"
      >
        {controls && <div className="context-sheet__section">{controls}</div>}
        {actions && (
          <div className="context-sheet__section context-sheet__actions">
            {actions}
          </div>
        )}
        {about && (
          <section className="context-sheet__section">
            <h3 className="context-sheet__heading">About this page</h3>
            <p className="context-sheet__about">{about}</p>
          </section>
        )}
        {trail && trail.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="context-sheet__section context-sheet__trail"
          >
            <ol>
              {trail.map((c, i) => (
                <li key={`${c.label}-${i}`}>
                  {c.to ? (
                    <Link to={c.to} onClick={close}>
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
      </BottomSheet>
    </div>
  )
}

export default ContextBar
