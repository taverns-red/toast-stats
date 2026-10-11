/**
 * Club-district history fold (#1782). Implemented in the green commit.
 */

import type {
  ClubDistrictHistoryIndex,
  ClubDistrictHistoryShard,
  ClubRaceStoreData,
} from '@taverns-red/shared-contracts'

export interface ClubDistrictHistoryArtifact {
  index: ClubDistrictHistoryIndex
  shards: Record<string, ClubDistrictHistoryShard>
}

export function foldClubDistrictHistory(
  _stores: readonly ClubRaceStoreData[]
): ClubDistrictHistoryArtifact {
  throw new Error('not implemented')
}
