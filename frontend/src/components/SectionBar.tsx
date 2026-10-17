import React, { useCallback, useId, useState } from 'react'
import { NavLink, matchPath, useLocation } from 'react-router-dom'
import { BottomSheet } from './BottomSheet'

/* Phone bottom section bar (#1832, mobile epic #1827 Phase 1, review §5.1).

   Four primary sections at thumb reach plus "More", which opens the shared
   BottomSheet (#1831) listing the rest. A bar with nothing in More (the
   two region sections, #1815) has no More button. Every item is a NavLink to a REAL
   route (ADR-005): no client-side tabs, so the back button, deep links and
   the URL-held PY/date (R3) are untouched.

   It renders where the top scroll-row used to sit in the DOM and is pinned to
   the bottom edge by CSS, so the keyboard and reading order are unchanged:
   the sections still come before the page content. The active item carries
   aria-current="page" (inside the sheet too); when the active section lives
   in More, the More button carries the active state and says which section
   is current. Geometry, safe-area and the page's bottom clearance live in
   section-bar.css. */

export interface SectionBarItem {
  label: string
  /** Absolute route path. */
  to: string
  /** NavLink `end`: active only at the exact path (the hub). */
  end?: boolean
  /** Decorative icon for the bar (primary items only). */
  icon?: React.ReactNode
}

export interface SectionBarProps {
  /** Accessible name of the nav landmark. */
  label: string
  primary: readonly SectionBarItem[]
  more: readonly SectionBarItem[]
  testId?: string
}

const isActive = (item: SectionBarItem, pathname: string): boolean =>
  matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null

const MoreIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
)

export const SectionBar: React.FC<SectionBarProps> = ({
  label,
  primary,
  more,
  testId,
}) => {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const sheetId = useId()
  const { pathname } = useLocation()
  const currentInMore = more.find(item => isActive(item, pathname))

  return (
    <>
      <nav aria-label={label} className="section-bar" data-testid={testId}>
        <ul className="section-bar__list">
          {primary.map(item => (
            <li key={item.to} className="section-bar__item">
              <NavLink
                to={item.to}
                end={item.end ?? false}
                className="section-bar__link"
              >
                <span className="section-bar__icon">{item.icon}</span>
                <span className="section-bar__label" data-label={item.label}>
                  {item.label}
                </span>
              </NavLink>
            </li>
          ))}
          {more.length > 0 && (
            <li className="section-bar__item">
              <button
                type="button"
                className="section-bar__link section-bar__more"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={sheetId}
                // Starts with the visible "More" (WCAG 2.5.3 label in name).
                aria-label={
                  currentInMore
                    ? `More sections, current: ${currentInMore.label}`
                    : 'More sections'
                }
                data-active={currentInMore ? 'true' : undefined}
                onClick={() => setOpen(true)}
              >
                <span className="section-bar__icon">
                  <MoreIcon />
                </span>
                <span className="section-bar__label" data-label="More">
                  More
                </span>
              </button>
            </li>
          )}
        </ul>
      </nav>
      {more.length > 0 && (
        <BottomSheet
          isOpen={open}
          onClose={close}
          title="More sections"
          id={sheetId}
        >
          <ul className="section-sheet__list">
            {more.map(item => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end ?? false}
                  className="section-sheet__link"
                  onClick={close}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}
    </>
  )
}

export default SectionBar
