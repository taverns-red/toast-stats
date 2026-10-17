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

// Per-region club shards + world file — snapshots/{date}/clubs-by-region/ (#1800)
export {
  buildClubsByRegion,
  readClubsByRegionInput,
  type ClubsByRegionClubInput,
  type ClubsByRegionDistrictInput,
  type ClubsByRegionInput,
  type ClubsByRegionResult,
} from './clubsByRegion.js'

// Region and world membership series — time-series/regions/{PY}.json (#2127)
export {
  buildRegionMembershipSeries,
  type RegionSeriesDistrictInput,
  type RegionMembershipSeriesInput,
} from './regionMembershipSeries.js'
