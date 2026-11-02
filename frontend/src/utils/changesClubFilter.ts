import {
  normalizeClubId,
  type SnapshotDiff,
} from '@taverns-red/shared-contracts'

/*
 * #2452 — What Changed's `?club=` filter: one club's slice of a district diff.
 *
 * Club ids are matched on `normalizeClubId`, because the club page's route id
 * and the snapshot's id can differ in zero-padding ("2959" vs "00002959").
 * District-level events (division/area recognition) carry an empty club id and
 * never match. The district totals are left as they are: the KPI tiles stay
 * district-wide; only the change list and the export narrow.
 */

function matches(clubId: string, key: string): boolean {
  return key !== '' && normalizeClubId(clubId) === key
}

/** The diff narrowed to one club: its events and its per-club rows. */
export function narrowDiffToClub<T extends SnapshotDiff>(
  diff: T,
  clubId: string
): T {
  const key = normalizeClubId(clubId)
  return {
    ...diff,
    events: diff.events.filter(e => matches(e.clubId, key)),
    clubs: {
      bothPresent: diff.clubs.bothPresent.filter(c => matches(c.clubId, key)),
      onlyInFrom: diff.clubs.onlyInFrom.filter(c => matches(c.clubId, key)),
      onlyInTo: diff.clubs.onlyInTo.filter(c => matches(c.clubId, key)),
    },
  }
}

/** The club's name as the diff records it, or null if the diff has no such club. */
export function clubNameInDiff(
  diff: SnapshotDiff,
  clubId: string
): string | null {
  const key = normalizeClubId(clubId)
  const named = [
    ...diff.clubs.bothPresent,
    ...diff.clubs.onlyInTo,
    ...diff.clubs.onlyInFrom,
    ...diff.events,
  ].find(c => matches(c.clubId, key) && c.clubName !== '')
  return named?.clubName ?? null
}
