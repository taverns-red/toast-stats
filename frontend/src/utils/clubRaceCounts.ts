/**
 * Exclusive club counts for the `/clubs` race surface (#1570).
 *
 * NOT IMPLEMENTED YET — the signatures exist so the red test typechecks.
 */

import type {
  ClubRaceTier,
  GlobalClubRaceReached,
  GlobalClubRaceTimelinePoint,
} from '@taverns-red/shared-contracts'

export type ClubRaceTierCounts = Record<ClubRaceTier, number>

export interface StackedRacePoint extends ClubRaceTierCounts {
  date: string
}

export function tileTierFor(_row: GlobalClubRaceReached): ClubRaceTier | null {
  throw new Error('tileTierFor: not implemented (#1570)')
}

export function exclusiveTierCounts(
  _rows: readonly GlobalClubRaceReached[]
): ClubRaceTierCounts {
  throw new Error('exclusiveTierCounts: not implemented (#1570)')
}

export function totalRecognised(_counts: ClubRaceTierCounts): number {
  throw new Error('totalRecognised: not implemented (#1570)')
}

export function stackedRaceTimeline(
  _timeline: readonly GlobalClubRaceTimelinePoint[],
  _currentCounts: ClubRaceTierCounts
): StackedRacePoint[] {
  throw new Error('stackedRaceTimeline: not implemented (#1570)')
}
