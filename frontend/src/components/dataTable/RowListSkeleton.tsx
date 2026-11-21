/**
 * RowListSkeleton: the loading state of a table below 768px, where the table
 * renders as phone rows. It uses the phone list's own row classes, so the rows
 * it reserves have the real row height and the list lands without a jump.
 *
 * Like DataTableSkeleton, the rows are `aria-hidden` and the wrapper is one
 * "Loading table" status. Keep that name: clubs-mobile-rows.smoke.ts waits for
 * it to clear, and ClubsTable.states.test.tsx pins it.
 */

import React from 'react'

interface RowListSkeletonProps {
  rows?: number
  testId?: string
}

export function RowListSkeleton({
  rows = 8,
  testId,
}: RowListSkeletonProps): React.JSX.Element {
  return (
    <div
      className="mobile-row-list"
      role="status"
      aria-label="Loading table"
      data-testid={testId}
    >
      <ul className="mobile-row-list__rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, row) => (
          <li key={row}>
            <div className="mobile-row">
              <div className="mobile-row__body">
                <span className="dt-skeleton__bar" />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <span className="sr-only">Loading table data...</span>
    </div>
  )
}
