import React from 'react'

/* #1577 — the compact, aligned table the four Area Director Actions sections
   render into. Red skeleton: the shape the specs are written against, with no
   behaviour yet. */

export interface ActionTableColumn<T> {
  /** Stable React key for the column. */
  key: string
  /** Visible column header, and the `data-label` each cell prints below 640px. */
  header: string
  /** The cell's content for one row. */
  cell: (row: T) => React.ReactNode
  /** Optional extra class on the `<td>` (e.g. a numeric or lead-column look). */
  className?: string
}

export interface ActionTableProps<T> {
  /** Visually hidden `<caption>` — the section heading already names it. */
  caption: string
  columns: readonly ActionTableColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  /** `data-testid` for the `<table>` itself. */
  testId?: string
}

export function ActionTable<T>(
  _props: ActionTableProps<T>
): React.ReactElement {
  return <></>
}

export default ActionTable
