/**
 * The TanStack Table v9 feature set for the landing rankings table (#2689).
 *
 * The rows arrive already filtered, searched and sorted by the page (the
 * `original → filtered → searchFiltered → sorted` pipeline, with my district
 * pinned to the top), so the table only needs to know which columns CAN sort
 * and which are visible: `rowSortingFeature` with `manualSorting`, the
 * visibility slice the Columns menu drives, and sizing for the colgroup.
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
import type { ClubGrowthHolding } from '../hooks/useClubGrowthRecipients'

/** A ranking row with its global display rank. */
export type RankedDistrict = DistrictRanking & {
  displayRank: number
  /** Clubs qualifying today but not yet confirmed (region-rollups
   *  `distinguishedCounts`, #2580); undefined = not published. */
  distinguishedProvisional?: number | undefined
}

/** Page context the cells read through `table.options.meta`. */
export interface RankingsTableMeta {
  isMyDistrict: (districtId: string) => boolean
  setMyDistrict: (districtId: string | null) => void
  competitiveAwards: CompetitiveAwardStandings | null | undefined
  clubGrowthHeld: ReadonlyMap<string, ClubGrowthHolding>
}

/** Module scope: the features object is a model input and must keep a stable
 *  identity across renders. */
export const rankingsTableFeatures = tableFeatures({
  rowSortingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  tableMeta: {} as RankingsTableMeta,
})

export type RankingsTableFeatures = typeof rankingsTableFeatures

export const rankingsColumnHelper = createColumnHelper<
  RankingsTableFeatures,
  RankedDistrict
>()
