/**
 * DataTableSkeleton: the loading state of a `DataTable` (#2676, spec §7).
 *
 * It is the table's own shape, not a generic grey block: the same
 * `<colgroup>` widths, the same header labels (as plain text) and rows of the
 * real minimum height, for the columns the table will actually show at this
 * width. When the data lands the table swaps in at the same size, so nothing
 * shifts (CLS 0).
 *
 * The table inside is `aria-hidden`; the wrapper is one polite status, so a
 * screen reader hears "Loading table" once rather than a grid of empty cells.
 */

import React from 'react'

/** The slice of a TanStack column the skeleton reads. */
export interface DataTableSkeletonColumn {
  id: string
  getSize: () => number
  columnDef: { header?: unknown }
}

interface DataTableSkeletonProps {
  columns: ReadonlyArray<DataTableSkeletonColumn>
  /** The row-header column: no width in the colgroup, it takes the rest. */
  rowHeaderColumnId: string
  /** Body rows to reserve. */
  rows?: number
  testId?: string
}

export function DataTableSkeleton({
  columns,
  rowHeaderColumnId,
  rows = 10,
  testId,
}: DataTableSkeletonProps): React.JSX.Element {
  const minWidth = columns.reduce((sum, c) => sum + c.getSize(), 0)
  return (
    <div
      className="dt-scroll-wrap dt-skeleton"
      role="status"
      aria-label="Loading table"
      data-testid={testId}
    >
      <div className="dt-scroll">
        <table className="dt" aria-hidden="true" style={{ minWidth }}>
          <colgroup>
            {columns.map(column => (
              <col
                key={column.id}
                {...(column.id === rowHeaderColumnId
                  ? {}
                  : { style: { width: column.getSize() } })}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map(column => (
                <th key={column.id} scope="col">
                  <span className="dt-sort-btn dt-sort-btn--static">
                    {column.columnDef.header as string}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>
                {columns.map(column => (
                  // px-2 py-3 + a 20px line is the real cell's 44px row.
                  <td key={column.id} className="px-2 py-3">
                    <span className="dt-skeleton__bar" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">Loading table data...</span>
    </div>
  )
}

export default DataTableSkeleton
