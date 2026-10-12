import React, { useCallback, useId, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { SortDirection } from '../hooks/useUrlSort'
import { useIsMobile } from '../hooks/useIsMobile'
import { SortableHeader } from './SortableHeader'
import { BottomSheet } from './BottomSheet'

/* PriorityColumnsTable (#1834, mobile epic #1827 Phase 1, review §5.2).

   The phone pattern for COMPARE-ACROSS-ROWS tables (Lesson 105 — browse-one-
   entity data uses MobileRowList instead). Below 768 it renders the row's
   identity plus 2 metric columns the visitor picks from a chip row, so the
   table always fits: no horizontal scroll, header cells on one line. The
   choice lives in the URL (`?cols=a,b`, ADR-005) so a shared link shows the
   same comparison. Sorting goes through the shared SortableHeader with the
   caller's `useUrlSort` state, so the sort survives the switch to the full
   table and back.

   "Full table" opens the caller's complete table in the shared BottomSheet
   (#1860), full-screen, inside a focusable labelled scroll region (Lesson
   105's three moves: role=region, aria-label, tabindex=0); its sticky
   identity column is the caller's own.

   ≥768 renders `fullTable` exactly as before — the desktop is unchanged.

   The caller owns its rows pipeline (R11: original → filtered → sorted);
   this component renders `rows` in the order given. */

export interface PriorityMetric<Row, F extends string> {
  /** Stable id used in `?cols=`. */
  id: string
  /** Short one-line label: the chip text and the column header. */
  label: string
  /** Longer description for the header's tooltip. */
  title?: string
  render: (row: Row) => React.ReactNode
  /** When set, the header sorts through SortableHeader by this field. */
  sortField?: F
}

export interface PriorityColumnsTableProps<Row, F extends string> {
  /** Accessible name of the priority table. */
  label: string
  rows: readonly Row[]
  rowKey: (row: Row) => string
  identityHeader: string
  renderIdentity: (row: Row) => React.ReactNode
  identitySortField?: F
  metrics: readonly PriorityMetric<Row, F>[]
  defaultMetricIds: readonly [string, string]
  sort?: { field: F | null; direction: SortDirection }
  onSort?: (field: F) => void
  /** The complete table as rendered at ≥768 (unchanged there). */
  fullTable: React.ReactNode
  /** What the full-screen sheet shows; defaults to `fullTable`. Pass the
   *  bare table when `fullTable` carries its own scroll wrapper, so the
   *  sheet's region is the only scroller. */
  sheetTable?: React.ReactNode
  /** Extra class on the sheet's scroll region (e.g. sticky-column vars). */
  sheetRegionClassName?: string
  /** Sheet heading (and dialog name). */
  fullTableTitle: string
  /** URL param for the chosen metrics. Default 'cols'. */
  colsParam?: string
  /** Let the identity wrap (long labels with a basis line) instead of
   *  ellipsizing on one line. */
  identityWraps?: boolean
  /** Rows that belong to named groups get a full-width heading row
   *  (`scope="colgroup"`) whenever the group changes. */
  groupOf?: (row: Row) => { key: string; title: React.ReactNode }
}

/** Resolve `?cols=` to exactly two known, distinct metric ids, topping up
 *  from the defaults when the URL names fewer than two. */
function resolveColumns(
  raw: string | null,
  known: readonly string[],
  defaults: readonly [string, string]
): [string, string] {
  const picked: string[] = []
  for (const id of (raw ?? '').split(',')) {
    if (known.includes(id) && !picked.includes(id)) picked.push(id)
    if (picked.length === 2) break
  }
  for (const id of defaults) {
    if (picked.length === 2) break
    if (!picked.includes(id)) picked.push(id)
  }
  return [picked[0]!, picked[1]!]
}

/** ≥768 returns the caller's full table and touches nothing else — no URL
 *  hooks, so a desktop render needs no Router (callers such as
 *  ClubHistoryTable stay usable outside one). The phone view below reads
 *  `?cols=` and does need a Router. */
export function PriorityColumnsTable<Row, F extends string>(
  props: PriorityColumnsTableProps<Row, F>
): React.JSX.Element {
  const isMobile = useIsMobile(768)
  if (!isMobile) return <>{props.fullTable}</>
  return <PhonePriorityColumns<Row, F> {...props} />
}

function PhonePriorityColumns<Row, F extends string>({
  label,
  rows,
  rowKey,
  identityHeader,
  renderIdentity,
  identitySortField,
  metrics,
  defaultMetricIds,
  sort,
  onSort,
  fullTable,
  sheetTable,
  sheetRegionClassName,
  fullTableTitle,
  colsParam = 'cols',
}: PriorityColumnsTableProps<Row, F>): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const [sheetOpen, setSheetOpen] = useState(false)
  const chipsLabelId = useId()
  const sheetId = useId()

  const knownIds = useMemo(() => metrics.map(m => m.id), [metrics])
  const chosen = resolveColumns(
    searchParams.get(colsParam),
    knownIds,
    defaultMetricIds
  )

  const choose = useCallback(
    (id: string) => {
      if (chosen.includes(id)) return
      // The newest pick becomes the right-hand column; the older of the two
      // shown drops out — "the last two you tapped".
      const next = [chosen[1], id]
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev)
          if (
            next[0] === defaultMetricIds[0] &&
            next[1] === defaultMetricIds[1]
          )
            params.delete(colsParam)
          else params.set(colsParam, next.join(','))
          return params
        },
        { replace: true }
      )
    },
    [chosen, colsParam, defaultMetricIds, setSearchParams]
  )

  const shown = chosen.map(id => metrics.find(m => m.id === id)!)
  const sortState = sort ?? { field: null, direction: 'asc' as SortDirection }

  const header = (
    text: string,
    field: F | undefined,
    numeric: boolean,
    title?: string
  ) => {
    const className = `priority-columns__th priority-columns__th--${
      numeric ? 'metric' : 'identity'
    }`
    return field && onSort ? (
      <SortableHeader<F>
        key={text}
        field={field}
        label={text}
        currentSort={sortState}
        onSort={onSort}
        thClassName={className}
        numeric={numeric}
      />
    ) : (
      <th key={text} scope="col" className={className} title={title}>
        {text}
      </th>
    )
  }

  return (
    <div className="priority-columns">
      <div className="priority-columns__controls">
        <span id={chipsLabelId} className="priority-columns__chips-label">
          Columns to compare
        </span>
        <div
          className="priority-columns__chips"
          role="group"
          aria-labelledby={chipsLabelId}
        >
          {metrics.map(m => {
            const pressed = chosen.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className="priority-columns__chip"
                aria-pressed={pressed}
                onClick={() => choose(m.id)}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      <table className="priority-columns__table" aria-label={label}>
        <colgroup>
          <col className="priority-columns__col-identity" />
          <col className="priority-columns__col-metric" />
          <col className="priority-columns__col-metric" />
        </colgroup>
        <thead>
          <tr>
            {header(identityHeader, identitySortField, false)}
            {shown.map(m => header(m.label, m.sortField, true, m.title))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)}>
              <td className="priority-columns__identity">
                {renderIdentity(row)}
              </td>
              {shown.map(m => (
                <td key={m.id} className="priority-columns__metric">
                  {m.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <button
        type="button"
        className="priority-columns__full"
        aria-haspopup="dialog"
        aria-controls={sheetOpen ? sheetId : undefined}
        onClick={() => setSheetOpen(true)}
      >
        Full table · all columns
      </button>

      <BottomSheet
        id={sheetId}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={fullTableTitle}
        closeLabel="Close full table"
        variant="full"
      >
        <div
          className={`priority-columns__sheet-region${
            sheetRegionClassName ? ` ${sheetRegionClassName}` : ''
          }`}
          role="region"
          tabIndex={0}
          aria-label={`${fullTableTitle} — scroll to see every column`}
        >
          {sheetTable ?? fullTable}
        </div>
      </BottomSheet>
    </div>
  )
}

export default PriorityColumnsTable
