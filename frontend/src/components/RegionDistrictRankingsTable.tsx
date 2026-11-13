/**
 * The region page's district rankings on the shared DataTable (#2702,
 * #2676 M3, ADR-006 Addendum 2).
 *
 * Which columns show is not CSS: the width tier picks the defaults, the user's
 * choices from the one Columns menu ride on top, and TanStack's
 * `columnVisibility` leaves a hidden column out of the DOM. The page keeps the
 * sort (the URL's field over the score-ordered base) and the region ranks, so
 * rows arrive in display order and the table only renders them.
 *
 * Two uses, one component:
 *  - `page` (>= 768): the Columns menu, a header that sticks to the page, and
 *    overflow mode only if the chosen columns cannot fit;
 *  - `sheet` (the phone's full-table sheet): every column, no menu, and the
 *    sheet's own region does the scrolling.
 */

import React, { useMemo } from 'react'
import { useTable } from '@tanstack/react-table'
import { ColumnsMenu, type ColumnsMenuSpec } from './ColumnsMenu'
import { DataTable } from './dataTable/DataTable'
import {
  ALWAYS_SHOWN_REGION_RANKINGS_IDS,
  REGION_RANKINGS_CHOOSER_GROUPS,
  REGION_RANKINGS_COLUMN_IDS,
  regionRankingsColumnMeta,
  regionRankingsTierDefaults,
} from './regionRankingsColumnMeta'
import {
  regionRankingsColumnForSortField,
  regionRankingsColumns,
  regionRankingsSortField,
} from './regionRankingsColumns'
import {
  regionRankingsTableFeatures,
  type RegionRankedDistrict,
  type RegionRankingsTableFeatures,
  type RegionRankingsTableMeta,
} from './regionRankingsTableFeatures'
import { useBreakpointTier } from '../hooks/useBreakpointTier'
import { useTierColumnVisibility } from '../hooks/useTierColumnVisibility'
import { formatDisplayDate } from '../utils/dateFormatting'

const COLUMN_SIZING: Readonly<Record<string, number>> = Object.fromEntries(
  REGION_RANKINGS_COLUMN_IDS.map(id => [id, regionRankingsColumnMeta[id].size])
)

const MENU_SPEC: ColumnsMenuSpec = {
  groups: REGION_RANKINGS_CHOOSER_GROUPS,
  ids: REGION_RANKINGS_COLUMN_IDS,
  meta: regionRankingsColumnMeta,
  alwaysShown: ALWAYS_SHOWN_REGION_RANKINGS_IDS,
}

const ALL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  REGION_RANKINGS_COLUMN_IDS.map(id => [id, true])
)

/** Left-aligned columns; every other column is a number. */
const TEXT_COLUMNS: ReadonlySet<string> = new Set(['district', 'trend', 'tier'])

/** The test ids the cells have always carried, by column. */
const CELL_TEST_IDS: Readonly<Record<string, string>> = {
  district: 'region-district-cell',
  rank: 'region-rank-cell',
  trend: 'region-trend-cell',
  score: 'score-cell',
  paidBase: 'paid-base',
  paidClubs: 'paid-current',
  paidDelta: 'countdown-netClubGrowth',
  paymentsBase: 'payments-base',
  payments: 'payments-current',
  paymentsDelta: 'payments-delta',
  distBase: 'dist-base',
  distinguished: 'dist-current',
  distDelta: 'dist-delta',
  toPaid: 'countdown-paidClubsRemaining',
  toPayments: 'countdown-paymentsRemaining',
  toDist: 'countdown-distinguishedClubsRemaining',
  education: 'countdown-educationTraining',
  cgd: 'countdown-clubGrowth',
  tier: 'tier-cell',
}

const headerClassName = (id: string): string =>
  [
    id === 'district' ? 'rankings-sticky-col' : '',
    TEXT_COLUMNS.has(id) ? '' : 'dt-num',
  ]
    .filter(Boolean)
    .join(' ')

const cellClassName = (id: string): string =>
  [
    'rankings-cell',
    id === 'district'
      ? 'rankings-sticky-col'
      : TEXT_COLUMNS.has(id)
        ? ''
        : 'rankings-cell--num',
  ]
    .filter(Boolean)
    .join(' ')

interface RegionDistrictRankingsTableProps extends RegionRankingsTableMeta {
  /** Region number as the page shows it, e.g. "01". */
  region: string
  rows: readonly RegionRankedDistrict[]
  /** The URL sort field and direction (`aggregate` for Score). */
  sort: { field: string | null; direction: 'asc' | 'desc' }
  onSort: (field: string) => void
  /** Snapshot date of the data, for the caption. */
  asOfDate?: string | undefined
  variant?: 'page' | 'sheet'
}

export const RegionDistrictRankingsTable: React.FC<
  RegionDistrictRankingsTableProps
> = ({
  region,
  rows,
  sort,
  onSort,
  asOfDate,
  variant = 'page',
  awards,
  trendOf,
}) => {
  const isSheet = variant === 'sheet'
  const tier = useBreakpointTier()
  const sortColumn = regionRankingsColumnForSortField(sort.field)
  const reveal = useMemo(() => (sortColumn ? [sortColumn] : []), [sortColumn])
  const columns = useTierColumnVisibility({
    storageName: 'region-rankings-table:columns',
    ids: REGION_RANKINGS_COLUMN_IDS,
    alwaysShown: ALWAYS_SHOWN_REGION_RANKINGS_IDS,
    defaultsFor: regionRankingsTierDefaults,
    tier,
    reveal,
  })

  const meta = useMemo<RegionRankingsTableMeta>(
    () => ({ awards, trendOf }),
    [awards, trendOf]
  )

  const table = useTable<RegionRankingsTableFeatures, RegionRankedDistrict>({
    features: regionRankingsTableFeatures,
    data: rows as RegionRankedDistrict[],
    columns: regionRankingsColumns,
    getRowId: d => d.districtId,
    state: {
      columnVisibility: isSheet ? ALL_VISIBLE : columns.visibility,
      columnSizing: COLUMN_SIZING,
    },
    meta,
    // The page owns the order; TanStack must not re-sort.
    manualSorting: true,
  })

  const name = `Region ${region} district rankings`
  const caption = `${name}${
    asOfDate ? ` as of ${formatDisplayDate(asOfDate)}` : ''
  }, ${rows.length} ${rows.length === 1 ? 'district' : 'districts'}, ranked within the region by Score. Column headers with buttons are sortable.`

  return (
    <>
      {isSheet ? null : (
        <div className="rankings-toolbar">
          <ColumnsMenu columns={columns} spec={MENU_SPEC} />
        </div>
      )}
      <DataTable
        table={table}
        id={
          isSheet
            ? 'region-district-rankings-sheet-table'
            : 'region-district-rankings-table'
        }
        label={name}
        tableLabel={name}
        caption={caption}
        sort={{
          field: regionRankingsColumnForSortField(sort.field),
          direction: sort.direction,
        }}
        onSort={id => onSort(regionRankingsSortField(id))}
        rowHeaderColumnId="district"
        headerClassName={headerClassName}
        cellClassName={cellClassName}
        rowClassName="rankings-row"
        cellProps={columnId => {
          const testId = CELL_TEST_IDS[columnId]
          return testId ? { 'data-testid': testId } : {}
        }}
        inScroller={isSheet}
        overflowHint={`Scroll sideways for more columns · ${columns.shownCount} of ${columns.totalCount} shown`}
      />
    </>
  )
}
