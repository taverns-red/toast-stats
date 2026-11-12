/**
 * The landing page's district rankings table on the shared DataTable
 * (#2689, #2676 M1, ADR-006 Addendum 2).
 *
 * Which columns show is not CSS: the width tier picks the defaults, the user's
 * choices from the one Columns menu ride on top, and TanStack's
 * `columnVisibility` leaves a hidden column out of the DOM. The page keeps the
 * filter, search and sort pipeline (and the my-district pin), so rows arrive
 * in display order and the table only renders them.
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
  ALWAYS_SHOWN_RANKINGS_IDS,
  RANKINGS_CHOOSER_GROUPS,
  RANKINGS_COLUMN_IDS,
  rankingsColumnMeta,
  rankingsTierDefaults,
} from './rankingsColumnMeta'
import {
  rankingsColumnForSortField,
  rankingsColumns,
  rankingsSortField,
} from './rankingsColumns'
import {
  rankingsTableFeatures,
  type RankedDistrict,
  type RankingsTableFeatures,
  type RankingsTableMeta,
} from './rankingsTableFeatures'
import { useBreakpointTier } from '../hooks/useBreakpointTier'
import { useTierColumnVisibility } from '../hooks/useTierColumnVisibility'
import { formatDisplayDate } from '../utils/dateFormatting'

const COLUMN_SIZING: Readonly<Record<string, number>> = Object.fromEntries(
  RANKINGS_COLUMN_IDS.map(id => [id, rankingsColumnMeta[id].size])
)

const MENU_SPEC: ColumnsMenuSpec = {
  groups: RANKINGS_CHOOSER_GROUPS,
  ids: RANKINGS_COLUMN_IDS,
  meta: rankingsColumnMeta,
  alwaysShown: ALWAYS_SHOWN_RANKINGS_IDS,
}

const ALL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  RANKINGS_COLUMN_IDS.map(id => [id, true])
)

const headerClassName = (id: string): string =>
  [
    id === 'district' ? 'rankings-sticky-col' : '',
    id !== 'district' ? 'dt-num' : '',
  ]
    .filter(Boolean)
    .join(' ')

const cellClassName = (id: string): string =>
  [
    'rankings-cell',
    id === 'district' ? 'rankings-sticky-col' : 'rankings-cell--num',
  ].join(' ')

const rowProps =
  (
    isMyDistrict: (id: string) => boolean,
    tierOf: (id: string) => string | undefined
  ) =>
  (row: { id: string }) => ({
    'data-testid': `district-row-${row.id}`,
    'data-tier': tierOf(row.id),
    'data-mine': isMyDistrict(row.id) ? 'true' : undefined,
  })

interface DistrictRankingsTableProps extends RankingsTableMeta {
  rows: readonly RankedDistrict[]
  /** The URL sort field and direction (`aggregate` for Score). */
  sort: { field: string | null; direction: 'asc' | 'desc' }
  onSort: (field: string) => void
  /** Snapshot date of the data, for the caption. */
  asOfDate?: string | undefined
  /** Content at the start of the toolbar, beside the Columns menu. */
  toolbarLead?: React.ReactNode
  /** Shown under the headers when a filter matches nothing (#1362). */
  emptyState: React.ReactNode
  variant?: 'page' | 'sheet'
}

export const DistrictRankingsTable: React.FC<DistrictRankingsTableProps> = ({
  rows,
  sort,
  onSort,
  asOfDate,
  toolbarLead,
  emptyState,
  variant = 'page',
  isMyDistrict,
  setMyDistrict,
  competitiveAwards,
  clubGrowthHeld,
}) => {
  const isSheet = variant === 'sheet'
  const tier = useBreakpointTier()
  const sortColumn = rankingsColumnForSortField(sort.field)
  const reveal = useMemo(() => (sortColumn ? [sortColumn] : []), [sortColumn])
  const columns = useTierColumnVisibility({
    storageName: 'rankings-table:columns',
    ids: RANKINGS_COLUMN_IDS,
    alwaysShown: ALWAYS_SHOWN_RANKINGS_IDS,
    defaultsFor: rankingsTierDefaults,
    tier,
    reveal,
  })

  const meta = useMemo<RankingsTableMeta>(
    () => ({ isMyDistrict, setMyDistrict, competitiveAwards, clubGrowthHeld }),
    [isMyDistrict, setMyDistrict, competitiveAwards, clubGrowthHeld]
  )

  const table = useTable<RankingsTableFeatures, RankedDistrict>({
    features: rankingsTableFeatures,
    data: rows as RankedDistrict[],
    columns: rankingsColumns,
    getRowId: d => d.districtId,
    state: {
      columnVisibility: isSheet ? ALL_VISIBLE : columns.visibility,
      columnSizing: COLUMN_SIZING,
    },
    meta,
    // The page owns the order (and pins my district); TanStack must not re-sort.
    manualSorting: true,
  })

  const tierOf = (id: string): string | undefined => {
    const raw = competitiveAwards?.distinguishedDistrict?.[id]?.currentTier
    return raw && raw !== 'NotDistinguished' ? raw : undefined
  }

  const caption = `District rankings${
    asOfDate ? ` as of ${formatDisplayDate(asOfDate)}` : ''
  }, ${rows.length} ${rows.length === 1 ? 'district' : 'districts'}, by Paid clubs, Total payments, Distinguished club count and Borda-count Score. Column headers with buttons are sortable.`

  return (
    <>
      {isSheet ? null : (
        <div className="rankings-toolbar">
          {toolbarLead}
          <ColumnsMenu columns={columns} spec={MENU_SPEC} />
        </div>
      )}
      <DataTable
        table={table}
        id={
          isSheet ? 'district-rankings-sheet-table' : 'district-rankings-table'
        }
        label="District rankings"
        caption={caption}
        sort={{
          field: rankingsColumnForSortField(sort.field),
          direction: sort.direction,
        }}
        onSort={id => onSort(rankingsSortField(id))}
        rowHeaderColumnId="district"
        headerClassName={headerClassName}
        cellClassName={cellClassName}
        rowClassName="rankings-row"
        rowProps={rowProps(isMyDistrict, tierOf)}
        cellProps={(columnId, rowId) =>
          columnId === 'district'
            ? { 'data-testid': `district-cell-${rowId}` }
            : columnId === 'rank'
              ? { 'data-testid': `rank-cell-${rowId}` }
              : {}
        }
        emptyState={emptyState}
        inScroller={isSheet}
        overflowHint={`Scroll sideways for more columns · ${columns.shownCount} of ${columns.totalCount} shown`}
      />
    </>
  )
}
