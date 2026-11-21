/**
 * RowListSkeleton: the loading state of a table that renders as phone rows
 * below 768px. It reuses the phone list's classes, in the default view's
 * shape (collapsed group toggles) or as two-line rows once the view is
 * narrowed. Keep the "Loading table" name: clubs-mobile-rows.smoke.ts waits
 * on it, and ClubsTable.states.test.tsx pins it.
 */

import React from 'react'

interface RowListSkeletonProps {
  /** Collapsed group toggles (the default view) instead of rows. */
  groups?: boolean
  count?: number
  /** Match the list's own `flush` and `wrapTitle` props. */
  flush?: boolean
  wrapTitle?: boolean
  testId?: string
}

export function RowListSkeleton({
  groups = false,
  count = 8,
  flush = false,
  wrapTitle = false,
  testId,
}: RowListSkeletonProps): React.JSX.Element {
  const items = Array.from({ length: count }, (_, i) => i)
  const rootClass = `mobile-row-list${flush ? ' mobile-row-list--flush' : ''}${
    wrapTitle ? ' mobile-row-list--wrap' : ''
  }`
  return (
    <div
      className={rootClass}
      role="status"
      aria-label="Loading table"
      data-testid={testId}
    >
      {groups ? (
        items.map(i => (
          <section className="mobile-row-group" key={i} aria-hidden="true">
            <div className="mobile-row-group__heading">
              <div className="mobile-row-group__toggle">
                <span className="mobile-row-group__label">
                  <span className="dt-skeleton__bar" />
                </span>
              </div>
            </div>
          </section>
        ))
      ) : (
        <ul className="mobile-row-list__rows" aria-hidden="true">
          {items.map(i => (
            <li key={i}>
              <div className="mobile-row">
                <span className="mobile-row__body">
                  <span className="mobile-row__line1">
                    <span className="dt-skeleton__bar dt-skeleton__bar--title" />
                  </span>
                  <span className="mobile-row__line2">
                    <span className="dt-skeleton__bar" />
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only">Loading table data...</span>
    </div>
  )
}
