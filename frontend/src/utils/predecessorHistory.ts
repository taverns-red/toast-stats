/**
 * "Before this district existed" (#2427) — pure joins for a new district.
 *
 * A new district (the 201–231 series formed on 2026-07-01) has no prior-year
 * data of its own. Its clubs do: each was in some other district last year.
 * The current roster is joined to the club-district history (#1782),
 * grouped by the district each club was in the prior program year, and each
 * group is read from that predecessor's year-end snapshot — the same per-club
 * lookup `useClubHistory` does, folded into aggregates. No member names.
 *
 * The gate is the history itself, never the snapshot index: the index lists
 * an orphan 2026-06-30 file for every 200-series district (#2439).
 */

import {
  clubIdsMatch,
  type ClubDistrictHistoryClub,
  type ClubStatisticsFile,
} from '@taverns-red/shared-contracts'
import { getProgramYear, type ProgramYear } from './programYear'
import { buildClubHistoryRow, sameDistrict } from './clubHistory'
import type { ClubTierCode } from './distinguishedTier'

/** The program year before `label` ("2026-2027" → 2025-2026). */
export function priorProgramYear(label: string): ProgramYear {
  return getProgramYear(Number(label.slice(0, 4)) - 1)
}

export interface PredecessorGroup {
  /** The district the clubs were in the prior PY, as the history spells it. */
  districtId: string
  /** The roster's own ids, in roster order. */
  clubIds: string[]
}

export interface PredecessorJoin {
  /**
   * True when any current club was already in THIS district in the prior
   * PY: the district has prior-year data of its own, so no panel.
   */
  hadThisDistrict: boolean
  /** Most clubs first; ties in district-number order. */
  groups: PredecessorGroup[]
  /** Clubs with no prior-PY district in the history (new charters). */
  newCharterIds: string[]
}

function compareDistrictIds(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a.localeCompare(b)
}

export function joinRosterToPredecessors(
  clubIds: readonly string[],
  lookup: (clubId: string) => ClubDistrictHistoryClub | undefined,
  districtId: string,
  priorLabel: string
): PredecessorJoin {
  const byDistrict = new Map<string, string[]>()
  const newCharterIds: string[] = []
  let hadThisDistrict = false
  for (const clubId of clubIds) {
    const prior = lookup(clubId)?.byProgramYear[priorLabel]
    if (!prior) {
      newCharterIds.push(clubId)
      continue
    }
    if (sameDistrict(prior, districtId)) hadThisDistrict = true
    const ids = byDistrict.get(prior)
    if (ids) ids.push(clubId)
    else byDistrict.set(prior, [clubId])
  }
  const groups = [...byDistrict]
    .map(([id, ids]) => ({ districtId: id, clubIds: ids }))
    .sort(
      (a, b) =>
        b.clubIds.length - a.clubIds.length ||
        compareDistrictIds(a.districtId, b.districtId)
    )
  return { hadThisDistrict, groups, newCharterIds }
}

/**
 * The club whose one history shard decides whether to offer the panel at
 * all: the oldest charter, which certainly existed last year. Without
 * charter dates, the first club.
 */
export function pickProbeClubId(
  clubs: ReadonlyArray<{ clubId: string; charterDate?: string | undefined }>
): string | null {
  let best: { clubId: string; charterDate?: string | undefined } | null = null
  for (const c of clubs) {
    if (!c.charterDate) continue
    if (!best?.charterDate || c.charterDate < best.charterDate) best = c
  }
  return best?.clubId ?? clubs[0]?.clubId ?? null
}

export type ProbeVerdict = 'candidate' | 'existing'

/**
 * `candidate` only when the probe club was in ANOTHER district in the prior
 * PY. No history, or no prior-PY district, is `existing`: never offer a
 * panel the history cannot fill. The full join confirms a candidate.
 */
export function probeVerdict(
  entry: ClubDistrictHistoryClub | null | undefined,
  districtId: string,
  priorLabel: string
): ProbeVerdict {
  const prior = entry?.byProgramYear[priorLabel]
  return prior && !sameDistrict(prior, districtId) ? 'candidate' : 'existing'
}

export interface PredecessorAggregate {
  districtId: string
  /** Current clubs that were in this district in the prior PY. */
  clubs: number
  /** Of those, the ones its year-end snapshot lists. */
  found: number
  /** Year-end membership, summed over `found`. */
  members: number
  /** Membership base (PY start), summed over `found`. */
  base: number
  net: number
  /** Distinguished at any tier. */
  distinguished: number
  byTier: Record<ClubTierCode, number>
  /** DCP goals met, summed over `found`. */
  goalsMet: number
  /** Mean DCP goals met over `found`; null when none were found. */
  avgDcpGoals: number | null
}

const zeroTiers = (): Record<ClubTierCode, number> => ({
  D: 0,
  S: 0,
  P: 0,
  M: 0,
})

/**
 * Fold one predecessor's year-end records for `clubIds`. `yearEndClubs` is
 * that snapshot's `data.clubs`, or null when it is unavailable. Each record
 * goes through `buildClubHistoryRow`, the club-history page's own reducer.
 */
export function aggregatePredecessor(
  districtId: string,
  clubIds: readonly string[],
  yearEndClubs: readonly ClubStatisticsFile[] | null
): PredecessorAggregate {
  const byTier = zeroTiers()
  let found = 0
  let members = 0
  let base = 0
  let goals = 0
  for (const id of clubIds) {
    const club = yearEndClubs?.find(c => clubIdsMatch(c.clubId, id))
    if (!club) continue
    const row = buildClubHistoryRow(0, '', club)
    found++
    members += row.membershipEnd ?? 0
    base += row.membershipBase ?? 0
    goals += row.dcpGoals ?? 0
    if (row.tierCode) byTier[row.tierCode]++
  }
  return {
    districtId,
    clubs: clubIds.length,
    found,
    members,
    base,
    net: members - base,
    distinguished: byTier.D + byTier.S + byTier.P + byTier.M,
    byTier,
    goalsMet: goals,
    avgDcpGoals: found ? Math.round((goals / found) * 10) / 10 : null,
  }
}

/** The predecessors summed; `districtId` is empty. */
export function totalAggregates(
  aggs: readonly PredecessorAggregate[]
): PredecessorAggregate {
  const byTier = zeroTiers()
  let clubs = 0
  let found = 0
  let members = 0
  let base = 0
  let goals = 0
  for (const a of aggs) {
    clubs += a.clubs
    found += a.found
    members += a.members
    base += a.base
    goals += a.goalsMet
    for (const t of Object.keys(byTier) as ClubTierCode[])
      byTier[t] += a.byTier[t]
  }
  return {
    districtId: '',
    clubs,
    found,
    members,
    base,
    net: members - base,
    distinguished: byTier.D + byTier.S + byTier.P + byTier.M,
    byTier,
    goalsMet: goals,
    avgDcpGoals: found ? Math.round((goals / found) * 10) / 10 : null,
  }
}
