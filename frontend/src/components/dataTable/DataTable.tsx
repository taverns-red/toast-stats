/**
 * DataTable: the shared table shell over a TanStack v9 table (#2676,
 * ADR-006 Addendum 2, spec §5 and §10.3).
 *
 * It owns what every data table needs and the page cannot do for itself:
 *  - a `<colgroup>` from the columns' sizes, so the header and body agree and
 *    the table can use `table-layout: fixed`;
 *  - a `<caption>` that names the table, and a row-header cell
 *    (`<th scope="row">`) for the column that labels each row;
 *  - a header of `SortableHeader` buttons (APG sortable-table contract);
 *  - a header that sticks to the PAGE at `--table-sticky-top`, because the
 *    wrapper is not a scroll container while the columns fit;
 *  - overflow mode, only when `table.getTotalSize()` exceeds the wrapper: the
 *    wrapper then scrolls sideways and becomes a labelled, focusable region
 *    with an edge cue on each side that has more to show. The header scrolls
 *    away with the page there (no synced clone, Q2).
 *
 * It does not own sorting state, the filter pipeline, the Columns choice or
 * the cell renderers: the caller passes the table and the sort it already has
 * (R11). Which columns exist at a width is TanStack `columnVisibility`, never
 * CSS.
 *
 * R-1: nothing here (or above it) may set `overflow` other than visible while
 * the columns fit. An ancestor with `overflow: hidden|auto` becomes the sticky
 * header's scrollport and the header stops sticking to the page.
 */

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { flexRender } from '@tanstack/react-table'
import { SortableHeader } from '../SortableHeader'

export interface DataTableSort {
  field: string | null
  direction: 'asc' | 'desc'
}

/**
 * The slice of a TanStack v9 table the shell reads. v9 types a table by its
 * feature set, so a component generic over `Table<TFeatures, TData>` cannot
 * see feature APIs (`getTotalSize`, `getCanSort`, ...). This structural type is
 * what any table with the sizing, sorting and visibility features satisfies;
 * `flexRender` gets its arguments through the `unknown` seam below.
 */
interface DataTableCell {
  id: string
  column: { id: string; columnDef: { cell?: unknown } }
  getContext: () => unknown
}
/** Attributes a caller may add to a row or cell: test ids and data
 *  attributes. Strings only, so nothing can add a handler (no row click). */
export type DataTableAttrs = Record<string, string | undefined>

export interface DataTableApi {
  getTotalSize: () => number
  getVisibleLeafColumns: () => ReadonlyArray<{
    id: string
    getSize: () => number
  }>
  getHeaderGroups: () => ReadonlyArray<{
    id: string
    headers: ReadonlyArray<{
      id: string
      column: {
        id: string
        getCanSort: () => boolean
        columnDef: { header?: unknown }
      }
    }>
  }>
  getRowModel: () => {
    rows: ReadonlyArray<{
      id: string
      original: unknown
      getVisibleCells: () => ReadonlyArray<DataTableCell>
    }>
  }
}

interface DataTableProps {
  table: DataTableApi
  /** The `<table>` id. */
  id: string
  /** Visually hidden caption: what the table is, as of when, how many rows. */
  caption: React.ReactNode
  /** Short name for the scroll region, e.g. "All clubs table". */
  label: string
  /** A short accessible name for the `<table>` itself (the caption keeps the
   *  detail). Without it the caption is the name. */
  tableLabel?: string
  sort: DataTableSort
  onSort: (field: string) => void
  /** The column that labels each row: rendered as `<th scope="row">` and left
   *  without a width in the colgroup, so it takes the remaining space. */
  rowHeaderColumnId: string
  /** Extra classes for the header cell of this column. */
  headerClassName?: (columnId: string) => string
  /** Extra classes for the body cell of this column. */
  cellClassName?: (columnId: string) => string
  /** Class for every body row. */
  rowClassName?: string
  /** Extra attributes for a body row (e.g. `data-testid`). */
  rowProps?: (row: { id: string; original: unknown }) => DataTableAttrs
  /** Extra attributes for a body cell, by column and row id. */
  cellProps?: (columnId: string, rowId: string) => DataTableAttrs
  /** Shown in place of the rows when there are none, under the headers. */
  emptyState?: React.ReactNode
  /** Shown above the table while it scrolls sideways. */
  overflowHint?: React.ReactNode
  /** The caller's own region scrolls this table (a full-screen sheet): the
   *  shell adds no scroll region, no edge cues and no overflow mode, and the
   *  header sticks to that scroller instead of the page. */
  inScroller?: boolean
}

/** Is there more content past each horizontal edge of the scroller? */
function edgesOf(el: HTMLElement): { start: boolean; end: boolean } {
  return {
    start: el.scrollLeft > 1,
    end: el.scrollWidth - el.clientWidth - el.scrollLeft > 1,
  }
}

export function DataTable({
  table,
  id,
  caption,
  label,
  tableLabel,
  sort,
  onSort,
  rowHeaderColumnId,
  headerClassName,
  cellClassName,
  rowClassName,
  rowProps,
  cellProps,
  emptyState,
  overflowHint,
  inScroller = false,
}: DataTableProps): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  const totalSize = table.getTotalSize()

  const syncEdges = useCallback(() => {
    const wrap = wrapRef.current
    const shell = shellRef.current
    if (!wrap || !shell) return
    const { start, end } = edgesOf(wrap)
    shell.setAttribute('data-scrollable-start', String(start))
    shell.setAttribute('data-scrollable-end', String(end))
  }, [])

  // Measured before paint, so the first frame is already in the right mode and
  // nothing shifts (CLS). A wrapper with no layout (width 0, as in jsdom) is
  // never "overflowing".
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || inScroller) return
    const measure = () => {
      const width = wrap.clientWidth
      setOverflow(width > 0 && totalSize > width)
      syncEdges()
    }
    measure()
    wrap.addEventListener('scroll', syncEdges, { passive: true })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(wrap)
    }
    return () => {
      wrap.removeEventListener('scroll', syncEdges)
      ro?.disconnect()
    }
  }, [totalSize, syncEdges, inScroller])

  // The edges also change when the rows do (a filter can shrink the content).
  const rows = table.getRowModel().rows
  useLayoutEffect(syncEdges, [rows, overflow, syncEdges])

  const regionProps = overflow
    ? {
        role: 'region' as const,
        tabIndex: 0,
        'aria-label': `${label}, scrolls sideways`,
      }
    : {}

  return (
    <>
      {overflow && overflowHint ? (
        <p className="dt-scroll-hint">{overflowHint}</p>
      ) : null}
      <div
        ref={shellRef}
        className={`dt-scroll-wrap${inScroller ? ' dt-scroll-wrap--in-scroller' : ''}`}
        data-scrollable-start="false"
        data-scrollable-end="false"
      >
        <div
          ref={wrapRef}
          className="dt-scroll"
          data-overflow={overflow ? 'true' : 'false'}
          {...regionProps}
        >
          <table
            id={id}
            className="dt"
            style={{ minWidth: totalSize }}
            aria-label={tableLabel}
          >
            <caption className="sr-only">{caption}</caption>
            <colgroup>
              {table.getVisibleLeafColumns().map(column => (
                <col
                  key={column.id}
                  {...(column.id === rowHeaderColumnId
                    ? {}
                    : { style: { width: column.getSize() } })}
                />
              ))}
            </colgroup>
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => {
                    const column = header.column
                    const text = column.columnDef.header as string
                    const thClassName = headerClassName?.(column.id) ?? ''
                    if (!column.getCanSort()) {
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          className={thClassName || undefined}
                        >
                          <span className="dt-sort-btn dt-sort-btn--static">
                            {text}
                          </span>
                        </th>
                      )
                    }
                    const active = sort.field === column.id
                    return (
                      <SortableHeader
                        key={header.id}
                        apg
                        field={column.id}
                        label={text}
                        currentSort={sort}
                        onSort={onSort}
                        thClassName={thClassName}
                        buttonClassName={`dt-sort-btn${active ? ' dt-sort-btn--active' : ''}`}
                      />
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.length === 0 && emptyState ? (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length}>
                    {emptyState}
                  </td>
                </tr>
              ) : null}
              {rows.map(row => (
                <tr key={row.id} {...rowProps?.(row)} className={rowClassName}>
                  {row.getVisibleCells().map(cell => {
                    const content = flexRender(
                      cell.column.columnDef.cell as never,
                      cell.getContext() as never
                    )
                    const className = cellClassName?.(cell.column.id)
                    const extra = cellProps?.(cell.column.id, row.id)
                    return cell.column.id === rowHeaderColumnId ? (
                      <th
                        key={cell.id}
                        {...extra}
                        scope="row"
                        className={className}
                      >
                        {content}
                      </th>
                    ) : (
                      <td key={cell.id} {...extra} className={className}>
                        {content}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {inScroller ? null : (
          <>
            <div
              className="dt-scroll__cue dt-scroll__cue--start"
              aria-hidden="true"
            />
            <div
              className="dt-scroll__cue dt-scroll__cue--end"
              aria-hidden="true"
            />
          </>
        )}
      </div>
    </>
  )
}
