/**
 * EducationRollupTable (#2732, M4 of #2676): the one sortable rollup table the
 * district (division and area), region (districts) and world (regions)
 * education pages share, on the `DataTable` foundation. Sort only: every
 * column always shows, and a table that cannot fit scrolls sideways in a
 * labelled region (never a CSS-hidden column).
 *
 * The caller owns the rows' order (the URL sort, R11); this file only maps its
 * column list onto a TanStack table. Cells are strings or nodes, so a row that
 * has no figure (a district without a ledger) says so in words in its row
 * header and leaves "—" in the figures, never a zero.
 */

import React from 'react'
import {
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { DataTable } from '../dataTable/DataTable'

/** Module scope: the features object keeps a stable identity across renders. */
const rollupFeatures = tableFeatures({
  rowSortingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
})
type RollupFeatures = typeof rollupFeatures

export interface EducationRollupColumn<Row extends object> {
  id: string
  /** Sentence-case header text. */
  header: string
  /** The row-label column is the first; the rest are right-aligned figures. */
  cell: (row: Row) => React.ReactNode
  /** Width in px for a figure column (the row-label column takes the rest). */
  size?: number
}

interface EducationRollupTableProps<Row extends object> {
  rows: readonly Row[]
  columns: ReadonlyArray<EducationRollupColumn<Row>>
  getRowId: (row: Row) => string
  sort: { field: string | null; direction: 'asc' | 'desc' }
  onSort: (field: string) => void
  /** The `<table>` id. */
  id: string
  /** Accessible name of the table, e.g. "Education by division". */
  label: string
  caption: string
  /** The caller's own sheet scrolls this table (the phone full-screen view). */
  inScroller?: boolean
}

const FIGURE_SIZE = 120

export function EducationRollupTable<Row extends object>({
  rows,
  columns,
  getRowId,
  sort,
  onSort,
  id,
  label,
  caption,
  inScroller = false,
}: EducationRollupTableProps<Row>): React.JSX.Element {
  const colHelper = React.useMemo(
    () => createColumnHelper<RollupFeatures, Row>(),
    []
  )
  const defs = React.useMemo(
    () =>
      colHelper.columns(
        columns.map(c =>
          colHelper.accessor(() => 0, {
            id: c.id,
            header: c.header,
            size: c.size ?? FIGURE_SIZE,
            cell: info => c.cell(info.row.original),
          })
        )
      ),
    [colHelper, columns]
  )
  const table = useTable<RollupFeatures, Row>({
    features: rollupFeatures,
    data: rows as Row[],
    columns: defs,
    getRowId,
    // The caller owns the order (the URL sort); the table only knows which
    // columns can sort.
    manualSorting: true,
  })
  const first = columns[0]!.id
  return (
    <DataTable
      table={table}
      id={id}
      label={label}
      tableLabel={label}
      caption={caption}
      sort={sort}
      onSort={onSort}
      rowHeaderColumnId={first}
      headerClassName={col => (col === first ? '' : 'dt-num')}
      cellClassName={col =>
        col === first ? 'education-rollup__unit' : 'education-rollup__num'
      }
      inScroller={inScroller}
      overflowHint="Scroll sideways for more columns"
    />
  )
}

export default EducationRollupTable
