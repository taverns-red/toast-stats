/**
 * Worldwide rollup (#1466 / #1498, epic #1496) — one canonical module set.
 *
 * @module @taverns-red/analytics-core/rollup
 */

export {
  rollUpGlobal,
  readSnapshotRollupInput,
  readSnapshotRankings,
  canonicalDistrictId,
  normalizeClubId,
  type ClubPaymentRow,
  type DistrictClubPayments,
  type GlobalRollupInput,
  type GlobalRollup,
  type CountryClubCount,
  type DuplicateClub,
} from './globalRollup.js'

export {
  buildGlobalTotals,
  programYearForSnapshotDate,
  type GlobalTotalsInput,
} from './globalTotals.js'

export {
  buildGlobalClubRace,
  type GlobalClubRaceInput,
  type GlobalClubRaceDistrictInput,
} from './globalClubRace.js'

// Region and world rollups — snapshots/{date}/region-rollups.json (#1799)
export {
  buildRegionRollups,
  readRegionRollupInput,
  type RegionRollupClub,
  type RegionRollupDistrictInput,
  type RegionRollupsInput,
  type RegionRollupsResult,
} from './regionRollups.js'
