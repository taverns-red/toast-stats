/**
 * Exclusive club counts for the `/clubs` race surface (#1570).
 *
 * The artifact's `timeline` is CUMULATIVE — a President's Distinguished club
 * is also counted under Select and Distinguished — which is right for "how
 * many clubs are at or past this line" and wrong for a KPI tile. Reading the
 * tiles off it triple-counted Ang Mo Kio C.C. Mandarin (D80, clubId 5193).
 *
 * Two rulings this module implements, both frontend-only (the artifact,
 * its schema and the collector are untouched):
 *
 * - **Basis is current standing.** A club is bucketed by `current.level` —
 *   the level it holds TODAY — not the best tier it ever reached. A club
 *   that slips from President's back to Distinguished moves tiles, while
 *   its crossing date and its place in the "First to President's" list stay
 *   exactly where they were: crossings are sticky (ruling R-A2, #1556).
 *   Today the two bases agree (0 of 35 clubs have drifted); this is a
 *   decision about the first day one does.
 *
 * - **Every reached row lands in exactly one bucket**, so the tiles sum to
 *   `reached.length` and the "35 clubs recognised worldwide" line is
 *   arithmetic rather than a second, separately-derived number. Where
 *   current standing cannot supply a tier — the club is absent from today's
 *   snapshot (`current: null`), or no longer meets any line — the row falls
 *   back to its high-water tier, then to the tier TI's official code names.
 *   A recognition already earned is never un-counted.
 */

import type {
  ClubRaceOfficialCode,
  ClubRaceTier,
  GlobalClubRaceReached,
  GlobalClubRaceTimelinePoint,
} from '@taverns-red/shared-contracts'

export type ClubRaceTierCounts = Record<ClubRaceTier, number>

/** One chart point: EXCLUSIVE per-tier bands that stack to the total. */
export interface StackedRacePoint extends ClubRaceTierCounts {
  date: string
}

/** Highest rung first — the order a high-water search reads them in. */
const TIERS_HIGH_FIRST: readonly ClubRaceTier[] = [
  'Smedley',
  'President',
  'Select',
  'Distinguished',
]

const OFFICIAL_CODE_TIER: Record<ClubRaceOfficialCode, ClubRaceTier> = {
  D: 'Distinguished',
  S: 'Select',
  P: 'President',
  M: 'Smedley',
}

const emptyCounts = (): ClubRaceTierCounts => ({
  Distinguished: 0,
  Select: 0,
  President: 0,
  Smedley: 0,
})

/**
 * The ONE tile a reached row belongs in: its current level, else its
 * high-water crossing, else TI's official code. `null` only for a row that
 * has neither a crossing nor a code — which the artifact does not publish.
 */
export function tileTierFor(row: GlobalClubRaceReached): ClubRaceTier | null {
  const level = row.current?.level
  if (level && level !== 'NotDistinguished') return level
  const highWater = TIERS_HIGH_FIRST.find(tier => row.tiers[tier])
  if (highWater) return highWater
  return row.official ? OFFICIAL_CODE_TIER[row.official.code] : null
}

/** Clubs per tier, each club counted once. Σ = `rows.length` (invariant). */
export function exclusiveTierCounts(
  rows: readonly GlobalClubRaceReached[]
): ClubRaceTierCounts {
  const counts = emptyCounts()
  for (const row of rows) {
    const tier = tileTierFor(row)
    if (tier) counts[tier] += 1
  }
  return counts
}

/** Clubs recognised worldwide — the tiles' total line. */
export function totalRecognised(counts: ClubRaceTierCounts): number {
  return (
    counts.Distinguished + counts.Select + counts.President + counts.Smedley
  )
}

const band = (higher: number, lower: number): number =>
  Math.max(0, higher - lower)

/**
 * The cumulative timeline re-expressed as exclusive bands that stack back to
 * the same total, with the FINAL point anchored to `currentCounts`.
 *
 * Earlier points are crossing-based (high-water), because that is all the
 * history the artifact records; the last point is current standing, so the
 * chart agrees with the tiles directly above it rather than contradicting
 * them by a club or two the day someone slips.
 */
export function stackedRaceTimeline(
  timeline: readonly GlobalClubRaceTimelinePoint[],
  currentCounts: ClubRaceTierCounts
): StackedRacePoint[] {
  const lastIndex = timeline.length - 1
  return timeline.map((point, index) =>
    index === lastIndex
      ? { date: point.date, ...currentCounts }
      : {
          date: point.date,
          Distinguished: band(point.Distinguished, point.Select),
          Select: band(point.Select, point.President),
          President: band(point.President, point.Smedley),
          Smedley: point.Smedley,
        }
  )
}
