import {
  districtTiersForProgramYear,
  remainingToDistrictTier,
  type DistrictRecognitionTier,
  type DistrictTierCounts,
} from '@taverns-red/analytics-core'
import { isOnTrack, type PaceMedian } from './regionPace'
import type {
  DistinguishedDistrictStatus,
  DistinguishedDistrictTier,
} from '../services/cdn'

/* Region District Recognition scoreboard (#2307) — for each tier of the
   program year's ladder, how many of the region's districts meet it at this
   snapshot, and how far the nearest district below it still has to go.

   "Meets" is the PY-gated `currentTier` that compute-analytics writes to
   competitive-awards.json (DistinguishedDistrictCalculator: the year's tier
   thresholds AND its prerequisites, Item 1490). Tiers are cumulative: a
   Select district also counts for Distinguished. Unknown (a tier earned on
   the metrics but a required prerequisite not reported) does not count as
   meeting; it is shown apart.

   Nearest = the district whose hardest metric is the smallest share of its
   base away: max(payments to go ÷ payment base, paid clubs to go ÷ club
   base, distinguished clubs to go ÷ club base). Ties go to the lower
   district number. Program year comes from the page (R3). */

export interface RecognitionDistrict extends DistrictTierCounts {
  districtId: string
}

export interface NearestDistrict {
  districtId: string
  paidClubsRemaining: number
  paymentsRemaining: number
  distinguishedClubsRemaining: number
}

export interface ScoreboardRow {
  tier: DistrictRecognitionTier
  /** Districts at this tier or higher. */
  meeting: number
  /** The closest district below this tier; null when all meet it. */
  nearest: NearestDistrict | null
  /** Districts on track by last year's pace (regionPace); null when there
      is no pace for this tier. Separate from `meeting`. */
  onTrack: number | null
}

export interface RecognitionScoreboard {
  /** Districts with a status in the awards file. */
  districts: number
  /** Lowest tier first. */
  rows: ScoreboardRow[]
  /** Metrics earn a tier but a required prerequisite is not reported. */
  unknown: number
}

const TIER_RANK: Record<DistinguishedDistrictTier, number> = {
  Unknown: 0,
  NotDistinguished: 0,
  Distinguished: 1,
  Select: 2,
  Presidents: 3,
  Smedley: 4,
}

const share = (remaining: number, base: number): number =>
  remaining <= 0 ? 0 : base > 0 ? remaining / base : Infinity

const byDistrictNumber = (a: string, b: string): number =>
  Number(a) - Number(b) || a.localeCompare(b)

export function buildRecognitionScoreboard(
  districts: ReadonlyArray<RecognitionDistrict>,
  statuses: Record<string, DistinguishedDistrictStatus> | null | undefined,
  programYear: string,
  pace?: Partial<Record<DistrictRecognitionTier, PaceMedian | null>> | null
): RecognitionScoreboard | null {
  if (!statuses) return null
  const present = districts
    .filter(d => statuses[d.districtId] !== undefined)
    .sort((a, b) => byDistrictNumber(a.districtId, b.districtId))
  if (present.length === 0) return null

  const tierOf = (d: RecognitionDistrict): DistinguishedDistrictTier =>
    statuses[d.districtId]!.currentTier

  // On track nests (Ron, 2026-10-27): a district counts for a tier only if
  // it is on track for every lower tier too, so a small group's lower
  // median cannot make Select outscore Distinguished. Null once any lower
  // tier has no pace.
  let stillOnTrack: Set<string> | null = new Set(present.map(d => d.districtId))
  const rows = districtTiersForProgramYear(programYear).map(tier => {
    const rank = TIER_RANK[tier]
    const below = present.filter(d => TIER_RANK[tierOf(d)] < rank)
    let nearest: NearestDistrict | null = null
    let best = Infinity
    for (const d of below) {
      const r = remainingToDistrictTier(d, tier, programYear)
      if (!r) continue
      const distance = Math.max(
        share(r.paymentsRemaining, d.paymentBase),
        share(r.paidClubsRemaining, d.paidClubBase),
        share(r.distinguishedClubsRemaining, d.paidClubBase)
      )
      if (nearest === null || distance < best) {
        best = distance
        nearest = { districtId: d.districtId, ...r }
      }
    }
    const median = pace?.[tier] ?? null
    if (median === null || stillOnTrack === null) {
      stillOnTrack = null
    } else {
      const prev: Set<string> = stillOnTrack
      stillOnTrack = new Set(
        present
          .filter(d => prev.has(d.districtId) && isOnTrack(d, median))
          .map(d => d.districtId)
      )
    }
    return {
      tier,
      meeting: present.length - below.length,
      nearest,
      onTrack: stillOnTrack === null ? null : stillOnTrack.size,
    }
  })

  return {
    districts: present.length,
    rows,
    unknown: present.filter(d => tierOf(d) === 'Unknown').length,
  }
}
