import React, { useMemo } from 'react'
import {
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Link } from 'react-router-dom'
import type { RegionRollupFigures } from '@taverns-red/shared-contracts'
import { useUrlSort } from '../../hooks/useUrlSort'
import { DataTable } from '../dataTable/DataTable'
import {
  PriorityColumnsTable,
  type PriorityMetric,
} from '../PriorityColumnsTable'
import { formatShare, type RollupChild } from '../../utils/regionRollupView'

/* RollupBreakdownTable (#1815) — the children of a rollup block (a region's
   districts, or the world's regions), one row each, each linking down a
   level. Compare-across-rows data, so below 768 it is the priority-column
   table (#1834): identity + 2 chosen metrics, the full table in a sheet; no
   horizontal scroll at 375. From 768 up it is the shared DataTable (#2733,
   #2676 M6): sort only, every column shown, a caption, and the name as the
   row header.

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

/* The columns on the DataTable. A column id is the sort field it sorts by; the
   component owns the order (manualSorting), as the regions leaderboard does. */
const breakdownFeatures = tableFeatures({
  rowSortingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
})
type BreakdownFeatures = typeof breakdownFeatures
const colHelper = createColumnHelper<BreakdownFeatures, RollupChild>()
type BreakdownColumns = ReturnType<typeof colHelper.columns>

/** Widths in px (8px padding per side included). The name takes the rest. */
const BREAKDOWN_SIZES: Readonly<Record<string, number>> = {
  name: 150,
  clubs: 80,
  thriving: 104,
  intervention: 120,
  distinguished: 88,
  csp: 80,
  october: 104,
  officer: 104,
}

const breakdownHeaderClass = (id: string): string =>
  id === 'name' ? 'rankings-sticky-col' : 'dt-num'

const breakdownCellClass = (id: string): string =>
  id === 'name'
    ? 'rankings-cell rankings-sticky-col'
    : 'rankings-cell rankings-cell--num'

const BreakdownDataTable: React.FC<{
  rows: readonly RollupChild[]
  columns: BreakdownColumns
  label: string
  noun: string
  sort: { field: Field | null; direction: 'asc' | 'desc' }
  onSort: (field: Field) => void
  inScroller: boolean
}> = ({ rows, columns, label, noun, sort, onSort, inScroller }) => {
  const table = useTable<BreakdownFeatures, RollupChild>({
    features: breakdownFeatures,
    data: rows as RollupChild[],
    columns,
    getRowId: r => r.id,
    state: { columnSizing: BREAKDOWN_SIZES },
    manualSorting: true,
  })
  return (
    <DataTable
      table={table}
      id={
        inScroller ? 'rollup-breakdown-sheet-table' : 'rollup-breakdown-table'
      }
      label={label}
      tableLabel={label}
      caption={`${label}: ${rows.length} ${noun}. Column headers with buttons are sortable.`}
      sort={sort}
      onSort={id => onSort(id as Field)}
      rowHeaderColumnId="name"
      headerClassName={breakdownHeaderClass}
      cellClassName={breakdownCellClass}
      rowClassName="rankings-row"
      rowProps={row => ({ 'data-testid': `breakdown-${row.id}` })}
      cellProps={(columnId, rowId) =>
        columnId === 'name'
          ? {}
          : { 'data-testid': `breakdown-${rowId}-${columnId}` }
      }
      inScroller={inScroller}
      overflowHint="Scroll sideways for more columns"
    />
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

  const columns = colHelper.columns([
    colHelper.accessor(r => r.label, {
      id: 'name',
      header: identityHeader,
      cell: info => (
        <Link
          to={info.row.original.to}
          className="inline-flex items-center min-h-[44px]"
        >
          {info.row.original.label}
        </Link>
      ),
    }),
    ...COLUMNS.map(col =>
      colHelper.accessor(r => sortValue(col, r.figures) ?? -1, {
        id: col.field,
        header: col.label,
        cell: info => <Cell col={col} f={info.row.original.figures} />,
      })
    ),
  ])

  const noun = `${identityHeader.toLowerCase()}s`
  const breakdownTable = (variant: 'page' | 'sheet') => (
    <BreakdownDataTable
      rows={sorted}
      columns={columns}
      label={label}
      noun={noun}
      sort={sort}
      onSort={toggleSort}
      inScroller={variant === 'sheet'}
    />
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
      sheetTable={breakdownTable('sheet')}
      rowTestId={r => `breakdown-row-${r.id}`}
      fullTable={
        // >=768: the shared DataTable. The header sticks to the page while the
        // columns fit; only when they cannot does it scroll sideways, as a
        // labelled, focusable region with edge cues (WCAG 2.1.1).
        <div className="districts-rankings-table-wrap districts-rankings-table-wrap--dt">
          {breakdownTable('page')}
        </div>
      }
    />
  )
}

export default RollupBreakdownTable
