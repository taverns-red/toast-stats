/* Pure joins over the club-district history (#1782 → #1806).

   The history is keyed by the CANONICAL club id ("977", never "00000977"), so
   every lookup normalises at read time (Lesson: read-time normalisation is
   free). Program years are the artifact's own "YYYY-YYYY" keys. */

import {
  normalizeClubId,
  type ClubDistrictHistoryClub,
  type ClubDistrictHistoryShard,
} from '@taverns-red/shared-contracts'

export interface ClosedClubSummary {
  lastDistrictId: string
  lastSeen: string
  closedYear: number
}

/** The club's record in a shard, whatever padding the caller's id has. */
export function findClubInShard(
  shard: ClubDistrictHistoryShard,
  clubId: string
): ClubDistrictHistoryClub | undefined {
  const key = normalizeClubId(clubId)
  return Object.prototype.hasOwnProperty.call(shard.clubs, key)
    ? shard.clubs[key]
    : undefined
}

/**
 * The district on the other side of a realignment transfer: for a club that
 * moved OUT, its district in the to-program-year; for one that moved IN, its
 * district in the from-program-year. Null when the history has no district
 * for that year, or names this same district (never claim a club
 * "transferred to" the page it is on).
 */
export function transferCounterpartDistrict(
  club: ClubDistrictHistoryClub,
  direction: 'in' | 'out',
  pys: { fromProgramYear: string; toProgramYear: string },
  districtId: string
): string | null {
  const py = direction === 'out' ? pys.toProgramYear : pys.fromProgramYear
  const other = club.byProgramYear[py]
  if (!other || other === districtId) return null
  return other
}

/**
 * A closed club's last sighting: the year it was last seen and the district
 * it was last in. Null while the club is still open (its last span has no
 * end on the history's `asOf` date).
 */
export function closedClubSummary(
  club: ClubDistrictHistoryClub
): ClosedClubSummary | null {
  const last = club.spans[club.spans.length - 1]
  if (!last || last.to === null) return null
  return {
    lastDistrictId: last.districtId,
    lastSeen: club.lastSeen,
    closedYear: Number(club.lastSeen.slice(0, 4)),
  }
}
