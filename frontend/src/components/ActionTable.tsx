import React from 'react'

/* #1577 — the compact, aligned table the four Area Director Actions sections
   render into.

   The sections carry four different payloads, so the columns are a per-section
   spec rather than a shared schema; only the CHROME is shared — real <table>
   semantics, a visually hidden <caption> (the section heading already names it
   on screen), `<th scope="col">` per column, and the `data-label` each cell
   needs for the <640px card rows.

   The mobile fallback is the pattern RaceTable established in #1562: below
   640px the header row is visually hidden, each row becomes a card and each
   cell prints its `data-label` above its value. The table sits in its own
   `overflow-x` container, so a wide row scrolls THERE and never turns the page
   body into a horizontal scroller.

   Density is CSS (see action-list.css): ~28px per row at desktop widths, and
   deliberately NOT at phone widths, where the card rows keep full tap
   targets. There is one fixed density — no toggle, no stored preference. */

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

export function ActionTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  testId,
}: ActionTableProps<T>): React.ReactElement {
  return (
    <div className="action-table__scroll">
      <table className="action-table" data-testid={testId}>
        <caption className="action-table__caption">{caption}</caption>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)} className="action-table__row">
              {columns.map(column => (
                <td
                  key={column.key}
                  data-label={column.header}
                  className={column.className}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ActionTable
