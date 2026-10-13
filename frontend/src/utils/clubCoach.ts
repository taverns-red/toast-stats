import {
  normalizeClubId,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'
import { buildCoached } from './clubGrowthFunnel'

/* Clubs-table coach status (#1954, split from #1794).

   The daily Coaches report lives in the reports sidecar, not on the analytics
   ClubTrend, so it is joined at read time at the same single site as the
   dues-renewal overlay (`useDistrictAnalytics`). The dedupe and
   latest-engagement rule is the Club Growth funnel's (`buildCoached`), so the
   Growth page and the Clubs table can never disagree about a club.

   Privacy: status and begin date only — the report's coach identity is
   dropped at parse and never reaches this shape. */

export interface ClubCoach {
  status: 'active' | 'completed'
  /** ISO begin date of the engagement, when TI prints one. */
  since: string | null
}

export type CoachLookup = ReadonlyMap<string, ClubCoach>

/** Club id (normalised) → its coach status, from a reports dataset. */
export function buildCoachLookup(
  reports: DistrictReportsDataset | null | undefined
): CoachLookup {
  const lookup = new Map<string, ClubCoach>()
  const records = reports?.sections.coaches?.records
  if (!records) return lookup
  const { active, completed } = buildCoached('', records)
  for (const row of [...active, ...completed]) {
    lookup.set(normalizeClubId(row.clubId), {
      status: row.status,
      since: row.since,
    })
  }
  return lookup
}

/** Attach `coach` to every club the lookup knows; others are left untouched. */
export function applyCoachOverlay(
  clubs: { clubId: string; coach?: ClubCoach }[],
  lookup: CoachLookup
): void {
  if (lookup.size === 0) return
  for (const club of clubs) {
    const coach = lookup.get(normalizeClubId(club.clubId))
    if (coach) club.coach = coach
  }
}

export type CoachFilterValue = 'Active' | 'Completed' | 'None'

/** The value the Coach filter, column and CSV share. */
export function coachFilterValue(club: {
  coach?: ClubCoach | undefined
}): CoachFilterValue {
  if (club.coach?.status === 'active') return 'Active'
  if (club.coach?.status === 'completed') return 'Completed'
  return 'None'
}

/** Sort rank: active first, then completed, then no coach. */
export function coachSortRank(club: { coach?: ClubCoach | undefined }): number {
  return club.coach?.status === 'active'
    ? 0
    : club.coach?.status === 'completed'
      ? 1
      : 2
}
