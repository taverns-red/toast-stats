import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { RegionRollupFigures } from '@taverns-red/shared-contracts'
import { useUrlSort } from '../../hooks/useUrlSort'
import { SortableHeader } from '../SortableHeader'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from '../PriorityColumnsTable'
import { formatShare, type RollupChild } from '../../utils/regionRollupView'

/* RollupBreakdownTable (#1815) — the children of a rollup block (a region's
   districts, or the world's regions), one row each, each linking down a
   level. Compare-across-rows data, so below 768 it is the priority-column
   table (#1834): identity + 2 chosen metrics, the full table in a sheet; no
   horizontal scroll at 375.

   Sort lives in the URL (`?sort=&dir=`, ADR-005). A null figure is "Not
   available" (shown N/A), never 0, and sorts last. */

const FIELDS = [
  'name',
  'clubs',
  'thriving',
  'intervention',
  'distinguished',
  'csp',
  'october',
  'officer',
] as const
type Field = (typeof FIELDS)[number]

interface Column {
  field: Exclude<Field, 'name'>
  label: string
  title: string
  /** Clubs counted (null = not available). */
  count: (f: RegionRollupFigures) => number | null
  /** Show the count as a share of the block's clubs. */
  asShare: boolean
}

const COLUMNS: readonly Column[] = [
  {
    field: 'clubs',
    label: 'Clubs',
    title: 'Clubs on the roster',
    count: f => f.clubs,
    asShare: false,
  },
  {
    field: 'thriving',
    label: 'Thriving',
    title: 'Thriving clubs (club-health rule)',
    count: f => f.health.thriving,
    asShare: true,
  },
  {
    field: 'intervention',
    label: 'Intervention',
    title: 'Clubs needing intervention (club-health rule)',
    count: f => f.health.interventionRequired,
    asShare: true,
  },
  {
    field: 'distinguished',
    label: 'Dist.',
    title: 'Clubs at any Distinguished level',
    count: f => f.clubs - f.distinguished.notDistinguished,
    asShare: true,
  },
  {
    field: 'csp',
    label: 'CSP',
    title: 'Club Success Plan submitted',
    count: f => f.compliance.cspSubmitted,
    asShare: true,
  },
  {
    field: 'october',
    label: 'Oct. dues',
    title: 'October renewals on time',
    count: f => f.compliance.octoberDuesOnTime,
    asShare: true,
  },
  {
    field: 'officer',
    label: 'Officers',
    title: 'Officer list on time',
    count: f => f.compliance.officerListOnTime,
    asShare: true,
  },
]

/** The sort key: the share for share columns, the count otherwise. */
function sortValue(col: Column, f: RegionRollupFigures): number | null {
  const n = col.count(f)
  if (n === null) return null
  if (!col.asShare) return n
  return f.clubs > 0 ? n / f.clubs : null
}

const Cell: React.FC<{ col: Column; f: RegionRollupFigures }> = ({
  col,
  f,
}) => {
  const n = col.count(f)
  if (n === null)
    return (
      <span className="rollup-breakdown__na" title="Not available">
        <span aria-hidden="true">N/A</span>
        <span className="sr-only">Not available</span>
      </span>
    )
  if (!col.asShare) return <>{n.toLocaleString('en-US')}</>
  return (
    <>
      <span className="block">
        {formatShare(f.clubs > 0 ? n / f.clubs : null)}
      </span>
      <span className="rollup-breakdown__sub">{n.toLocaleString('en-US')}</span>
    </>
  )
}

export interface RollupBreakdownTableProps {
  rows: readonly RollupChild[]
  /** Accessible name of the table ("Region 07 districts"). */
  label: string
  /** "District" / "Region". */
  identityHeader: string
}

export const RollupBreakdownTable: React.FC<RollupBreakdownTableProps> = ({
  rows,
  label,
  identityHeader,
}) => {
  const { sort, toggleSort } = useUrlSort<Field>({
    fields: FIELDS,
    defaultField: 'name',
    defaultDirection: 'asc',
  })

  const sorted = useMemo(() => {
    const dir = sort.direction === 'desc' ? -1 : 1
    const col = COLUMNS.find(c => c.field === sort.field)
    // Input order is numeric-by-id (the view model's order) = "name".
    if (!col) return sort.direction === 'desc' ? [...rows].reverse() : [...rows]
    return [...rows].sort((a, b) => {
      const va = sortValue(col, a.figures)
      const vb = sortValue(col, b.figures)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      return (va - vb) * dir
    })
  }, [rows, sort])

  const metrics: PriorityMetric<RollupChild, Field>[] = COLUMNS.map(col => ({
    id: col.field,
    label: col.label,
    title: col.title,
    sortField: col.field,
    render: r => <Cell col={col} f={r.figures} />,
  }))

  const table = (
    <table className="rollup-breakdown" aria-label={label}>
      <thead>
        <tr>
          <SortableHeader<Field>
            field="name"
            label={identityHeader}
            currentSort={sort}
            onSort={toggleSort}
            thClassName="rollup-breakdown__th rollup-breakdown__th--name"
          />
          {COLUMNS.map(col => (
            <SortableHeader<Field>
              key={col.field}
              field={col.field}
              label={col.label}
              currentSort={sort}
              onSort={toggleSort}
              numeric
              thClassName="rollup-breakdown__th"
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.id} data-testid={`breakdown-${r.id}`}>
            <th scope="row" className="rollup-breakdown__name">
              <Link to={r.to}>{r.label}</Link>
            </th>
            {COLUMNS.map(col => (
              <td
                key={col.field}
                className="rollup-breakdown__num"
                data-testid={`breakdown-${r.id}-${col.field}`}
              >
                <Cell col={col} f={r.figures} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <PriorityColumnsTable<RollupChild, Field>
      label={label}
      rows={sorted}
      rowKey={r => r.id}
      identityHeader={identityHeader}
      identitySortField="name"
      renderIdentity={r => <Link to={r.to}>{r.label}</Link>}
      metrics={metrics}
      defaultMetricIds={['intervention', 'distinguished']}
      sort={sort}
      onSort={toggleSort}
      fullTableTitle={`${label} — all columns`}
      sheetTable={table}
      rowTestId={r => `breakdown-row-${r.id}`}
      fullTable={
        <div
          className="rollup-breakdown__scroll"
          role="region"
          tabIndex={0}
          aria-label={`${label} — all columns`}
        >
          {table}
        </div>
      }
    />
  )
}

export default RollupBreakdownTable
