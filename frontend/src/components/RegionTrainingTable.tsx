/**
 * RegionTrainingTable (#2296, #2733): a region's districts compared on club
 * officer training, on the shared DataTable (#2676, spec §14 M6).
 *
 * Sort only. The table has one header row, so each figure column names its own
 * round ("Round 1 (Jun–Aug): 4+"); a round that has not opened shows its
 * opening date in the header and has no sort (every club reads 0). The page
 * owns the sort (`?sort=&dir=`), the threshold and the rows.
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
import { Link } from 'react-router-dom'
import { DataTable } from './dataTable/DataTable'
import {
  formatPct,
  roundMonths,
  type TrainingRound,
} from '../utils/officerTraining'
import type {
  RegionTrainingMetric,
  RegionTrainingRow,
} from '../utils/regionTraining'

const trainingFeatures = tableFeatures({
  rowSortingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
})
type TrainingFeatures = typeof trainingFeatures
const colHelper = createColumnHelper<TrainingFeatures, RegionTrainingRow>()

/** Widths in px (8px padding per side included). The district takes the rest. */
const SIZES = { district: 150, clubs: 80, figure: 120 } as const

export interface RegionTrainingTableProps {
  region: string
  rows: readonly RegionTrainingRow[]
  /** The figure columns of each round, in order. */
  metrics: ReadonlyArray<{ metric: RegionTrainingMetric; label: string }>
  /** "opens Nov 1" for a round that has not opened; null for one that has. */
  opens: (round: TrainingRound) => string | null
  sort: { field: string | null; direction: 'asc' | 'desc' }
  onSort: (field: string) => void
  /** Where a district's own Training page is. */
  districtHref: (districtId: string) => string
}

const figureOf = (
  row: RegionTrainingRow,
  round: TrainingRound,
  metric: RegionTrainingMetric
): number | null => {
  const f = row.rounds[round - 1]
  if (!f) return null
  return metric === 'dcp'
    ? f.pctDcp
    : metric === 'allSeven'
      ? f.pctAllSeven
      : f.pctAtThreshold
}

const headerClass = (id: string): string =>
  id === 'district' ? 'rankings-sticky-col' : 'dt-num'

const cellClass = (id: string): string =>
  id === 'district'
    ? 'rankings-cell rankings-sticky-col'
    : 'rankings-cell rankings-cell--num'

export const RegionTrainingTable: React.FC<RegionTrainingTableProps> = ({
  region,
  rows,
  metrics,
  opens,
  sort,
  onSort,
  districtHref,
}) => {
  const columns = colHelper.columns([
    colHelper.accessor(r => Number(r.districtId), {
      id: 'district',
      header: 'District',
      cell: info => (
        <Link
          to={districtHref(info.row.original.districtId)}
          className="clubs-name-link inline-flex items-center min-h-[44px]"
        >
          District {info.row.original.districtId}
        </Link>
      ),
    }),
    colHelper.display({
      id: 'clubs',
      header: 'Clubs',
      cell: info => info.row.original.clubs,
    }),
    ...([1, 2] as const).flatMap(round => {
      const upcoming = opens(round)
      return metrics.map(m => {
        const header = `Round ${round} ${roundMonths(round)}${
          upcoming ? `, ${upcoming}` : ''
        }: ${m.label}`
        const cell = (row: RegionTrainingRow) =>
          formatPct(upcoming ? null : figureOf(row, round, m.metric))
        const id = `r${round}-${m.metric}`
        // A round that has not opened has nothing to sort by (review N6).
        return upcoming
          ? colHelper.display({
              id,
              header,
              cell: info => cell(info.row.original),
            })
          : colHelper.accessor(r => figureOf(r, round, m.metric) ?? -1, {
              id,
              header,
              cell: info => cell(info.row.original),
            })
      })
    }),
  ])

  const table = useTable<TrainingFeatures, RegionTrainingRow>({
    features: trainingFeatures,
    data: rows as RegionTrainingRow[],
    columns,
    getRowId: r => r.districtId,
    state: {
      columnSizing: {
        district: SIZES.district,
        clubs: SIZES.clubs,
        ...Object.fromEntries(
          ([1, 2] as const).flatMap(round =>
            metrics.map(m => [`r${round}-${m.metric}`, SIZES.figure])
          )
        ),
      },
    },
    // The page owns the order (the URL sort).
    manualSorting: true,
  })

  return (
    <div className="districts-rankings-table-wrap districts-rankings-table-wrap--dt">
      <DataTable
        table={table}
        id="region-training-data-table"
        testId="region-training-table"
        label={`Region ${region} districts by officer training`}
        caption={`Region ${region} districts: % of clubs by officers trained, per round. ${rows.length} ${
          rows.length === 1 ? 'district' : 'districts'
        }. Column headers with buttons are sortable.`}
        sort={sort}
        onSort={onSort}
        rowHeaderColumnId="district"
        headerClassName={headerClass}
        cellClassName={cellClass}
        rowClassName="rankings-row"
        overflowHint="Scroll sideways for more columns"
      />
    </div>
  )
}

export default RegionTrainingTable
