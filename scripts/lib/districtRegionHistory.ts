/**
 * District → region history fold (#1820). Implemented in the green commit.
 */

import type {
  AllDistrictsRankingsData,
  DistrictRegionHistory,
} from '@taverns-red/shared-contracts'

export interface RegionSource {
  snapshotDate: string
  rankings: AllDistrictsRankingsData
}

export function foldDistrictRegionHistory(
  _sources: readonly RegionSource[]
): DistrictRegionHistory {
  throw new Error('not implemented')
}

export function selectRegionSourceDates(_dates: readonly string[]): string[] {
  throw new Error('not implemented')
}
