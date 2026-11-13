/**
 * The TanStack Table v9 feature set for the region district rankings
 * (#2702, #2676 M3), on the same footing as the landing table's.
 *
 * Rows arrive already ordered by the page (the URL sort over the score-ordered
 * base), so the table only needs to know which columns CAN sort and which are
 * visible: `rowSortingFeature` with `manualSorting`, the visibility slice the
 * Columns menu drives, and sizing for the colgroup.
 */

import {
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table'
import type { DistrictRanking } from '../types/districts'
import type { CompetitiveAwardStandings } from '../services/cdn'

/** A ranking row with its rank within the region (ties share a rank). */
export type RegionRankedDistrict = DistrictRanking & {
  regionRank: number
  regionRankTied: boolean
}

/** Page context the cells read through `table.options.meta`. */
export interface RegionRankingsTableMeta {
  awards: CompetitiveAwardStandings | null
  /** Membership series per district: `undefined` while loading, `null` when
   *  there is none for the date. */
  trendOf: (districtId: string) => number[] | null | undefined
}

/** Module scope: the features object is a model input and must keep a stable
 *  identity across renders. */
export const regionRankingsTableFeatures = tableFeatures({
  rowSortingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  tableMeta: {} as RegionRankingsTableMeta,
})

export type RegionRankingsTableFeatures = typeof regionRankingsTableFeatures

export const regionRankingsColumnHelper = createColumnHelper<
  RegionRankingsTableFeatures,
  RegionRankedDistrict
>()
