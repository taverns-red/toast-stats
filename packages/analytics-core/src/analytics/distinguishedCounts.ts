/**
 * One confirmed / provisional Distinguished classification per club, and one
 * `distinguishedCounts` per level (#2553, epic #2555).
 *
 * Ron, 2026-11-08: confirmed is the headline everywhere; provisional is shown
 * beside it and never added in. This module is the one rule every level
 * (district, division, area, region, world) counts with.
 *
 * **Confirmed** is the rankings' rule (`distinguishedClubs`, #304, #2221):
 * - once TI recognises clubs (`basis: 'ti-recognised'`), TI's own
 *   'Club Distinguished Status' letter (D/S/P/M, or the historical word
 *   forms) is the club's confirmed tier;
 * - before that (`basis: 'april-renewals'`), the clubs whose April renewals
 *   alone meet a rung, CSP-gated: `getConfirmedDistinguishedLevel`, exactly
 *   as `countConfirmedDistinguishedClubs` counts them. A club with no
 *   district-performance row has 0 renewals and so is never confirmed, the
 *   same outcome as that function skipping it.
 *
 * **Provisional** is the frontend's `isProvisionallyDistinguished` rule
 * (`isDistinguishedProvisional`): the club's level on current membership
 * (CSP-gated, the program year's ladder) is a Distinguished level, the data
 * month is before April, and its April renewals do not hold that level.
 *
 * **Counting.** A club with a confirmed level is counted once, as confirmed,
 * in its confirmed tier, even when a higher level is still provisional. A
 * club with only a provisional level is counted as provisional in that tier.
 * So confirmed and provisional are disjoint, and the tiers partition each.
 *
 * **Club base: every club on TI's club-performance report**, paid or not.
 * That is the base TI's own district count and the rankings use, so the
 * district's confirmed count equals the rankings' figure for the same date.
 *
 * @module distinguishedCounts
 */

import type {
  DistinguishedCounts,
  DistinguishedTierCount,
} from '@taverns-red/shared-contracts'
import type { DistinguishedLevel } from '../types.js'
import { programYearForDate } from './AnalyticsUtils.js'
import {
  classifyDistinguishedTier,
  determineDistinguishedLevel,
  getCSPStatus,
  getConfirmedDistinguishedLevel,
  isDistinguishedProvisional,
  type DistinguishedTierCode,
} from './ClubEligibilityUtils.js'

/**
 * Which rule decides a club's confirmed level for a date.
 *
 * - `ti-recognised`: TI publishes per-club Distinguished letters.
 * - `april-renewals`: TI reports none yet; confirmed comes from renewals.
 */
export type DistinguishedCountBasis = 'ti-recognised' | 'april-renewals'

export type CountedDistinguishedLevel = Exclude<
  DistinguishedLevel,
  'NotDistinguished'
>

/** The club fields the rule reads. Every `ClubStatistics` has them. */
export interface DistinguishedClassificationInput {
  dcpGoals: number
  membershipCount: number
  membershipBase: number
  /** District-performance "Apr. Ren." count; absent reads as 0. */
  aprilRenewals?: number
  /** Normalised CSP cell; absent = not required that year (submitted). */
  cspSubmitted?: boolean
  /** TI's raw 'Club Distinguished Status' value. */
  distinguishedStatus?: string
}

export interface ClubDistinguishedClassification {
  confirmedLevel: CountedDistinguishedLevel | null
  provisionalLevel: CountedDistinguishedLevel | null
}

export interface DistinguishedClassificationOptions {
  /** The snapshot's logical date (YYYY-MM-DD); its month picks the rule. */
  snapshotDate: string
  /** Program year of `snapshotDate` ("YYYY-YYYY"), threaded, not re-derived. */
  programYear: string
  basis: DistinguishedCountBasis
}

export interface AreaDistinguishedCounts {
  areaId: string
  distinguishedCounts: DistinguishedCounts
}

export interface DivisionDistinguishedCounts {
  divisionId: string
  distinguishedCounts: DistinguishedCounts
  areas: AreaDistinguishedCounts[]
}

const TIER_LEVEL: Record<DistinguishedTierCode, CountedDistinguishedLevel> = {
  D: 'Distinguished',
  S: 'Select',
  P: 'President',
  M: 'Smedley',
}

type TierKey = keyof DistinguishedCounts['byTier']

const LEVEL_TIER: Record<CountedDistinguishedLevel, TierKey> = {
  Distinguished: 'distinguished',
  Select: 'select',
  President: 'presidents',
  Smedley: 'smedley',
}

const counted = (
  level: DistinguishedLevel
): CountedDistinguishedLevel | null =>
  level === 'NotDistinguished' ? null : level

/**
 * TI recognises clubs once any club on the report carries a Distinguished
 * letter. Before that every district reports 0 and confirmed comes from the
 * April renewals (the rankings' switch, #304).
 */
export function distinguishedCountBasis(
  clubs: readonly Pick<
    DistinguishedClassificationInput,
    'distinguishedStatus'
  >[]
): DistinguishedCountBasis {
  return clubs.some(
    c => classifyDistinguishedTier(c.distinguishedStatus) !== null
  )
    ? 'ti-recognised'
    : 'april-renewals'
}

/** A club's confirmed and provisional Distinguished levels. */
export function classifyClubDistinguished(
  club: DistinguishedClassificationInput,
  options: DistinguishedClassificationOptions
): ClubDistinguishedClassification {
  const cspSubmitted = getCSPStatus(club)
  const renewals = club.aprilRenewals ?? 0

  let confirmedLevel: CountedDistinguishedLevel | null
  if (options.basis === 'ti-recognised') {
    const tier = classifyDistinguishedTier(club.distinguishedStatus)
    confirmedLevel = tier ? TIER_LEVEL[tier] : null
  } else {
    confirmedLevel = cspSubmitted
      ? counted(
          getConfirmedDistinguishedLevel(
            club.dcpGoals,
            renewals,
            club.membershipBase,
            options.programYear
          )
        )
      : null
  }

  const currentLevel: DistinguishedLevel = cspSubmitted
    ? determineDistinguishedLevel(
        club.dcpGoals,
        club.membershipCount,
        club.membershipCount - club.membershipBase,
        options.programYear
      )
    : 'NotDistinguished'
  const dataMonth = Number.parseInt(options.snapshotDate.slice(5, 7), 10)
  const provisionalLevel = isDistinguishedProvisional(
    currentLevel,
    renewals,
    club.membershipBase,
    dataMonth
  )
    ? counted(currentLevel)
    : null

  return { confirmedLevel, provisionalLevel }
}

const zeroTier = (): DistinguishedTierCount => ({
  confirmed: 0,
  provisional: 0,
})

export function emptyDistinguishedCounts(): DistinguishedCounts {
  return {
    confirmed: 0,
    provisional: 0,
    byTier: {
      distinguished: zeroTier(),
      select: zeroTier(),
      presidents: zeroTier(),
      smedley: zeroTier(),
    },
  }
}

/** Count clubs: confirmed once at their confirmed tier, else provisional. */
export function tallyDistinguished(
  classifications: readonly ClubDistinguishedClassification[]
): DistinguishedCounts {
  const counts = emptyDistinguishedCounts()
  for (const { confirmedLevel, provisionalLevel } of classifications) {
    if (confirmedLevel) {
      counts.confirmed += 1
      counts.byTier[LEVEL_TIER[confirmedLevel]].confirmed += 1
    } else if (provisionalLevel) {
      counts.provisional += 1
      counts.byTier[LEVEL_TIER[provisionalLevel]].provisional += 1
    }
  }
  return counts
}

/** Field-by-field sum, for rolling a level up into the one above it. */
export function addDistinguishedCounts(
  a: DistinguishedCounts,
  b: DistinguishedCounts
): DistinguishedCounts {
  const tier = (key: TierKey): DistinguishedTierCount => ({
    confirmed: a.byTier[key].confirmed + b.byTier[key].confirmed,
    provisional: a.byTier[key].provisional + b.byTier[key].provisional,
  })
  return {
    confirmed: a.confirmed + b.confirmed,
    provisional: a.provisional + b.provisional,
    byTier: {
      distinguished: tier('distinguished'),
      select: tier('select'),
      presidents: tier('presidents'),
      smedley: tier('smedley'),
    },
  }
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * A district's counts, and each of its divisions' and areas', from one
 * snapshot's clubs. The basis is read from the clubs themselves.
 *
 * @param clubs - Every club on the district's club-performance report
 * @param snapshotDate - The snapshot's logical date (YYYY-MM-DD)
 * @param basis - Override for a caller that knows the date-wide basis
 */
export function computeDistinguishedCounts(
  clubs: readonly (DistinguishedClassificationInput & {
    divisionId: string
    areaId: string
  })[],
  snapshotDate: string,
  basis: DistinguishedCountBasis = distinguishedCountBasis(clubs)
): { district: DistinguishedCounts; divisions: DivisionDistinguishedCounts[] } {
  const options: DistinguishedClassificationOptions = {
    snapshotDate,
    programYear: programYearForDate(snapshotDate),
    basis,
  }
  const all: ClubDistinguishedClassification[] = []
  const byDivision = new Map<
    string,
    Map<string, ClubDistinguishedClassification[]>
  >()
  for (const club of clubs) {
    const classification = classifyClubDistinguished(club, options)
    all.push(classification)
    const areas = byDivision.get(club.divisionId) ?? new Map()
    byDivision.set(club.divisionId, areas)
    areas.set(club.areaId, [...(areas.get(club.areaId) ?? []), classification])
  }

  const divisions = [...byDivision.keys()].sort(byString).map(divisionId => {
    const areaMap = byDivision.get(divisionId)!
    const areas = [...areaMap.keys()].sort(byString).map(areaId => ({
      areaId,
      distinguishedCounts: tallyDistinguished(areaMap.get(areaId)!),
    }))
    return {
      divisionId,
      distinguishedCounts: tallyDistinguished([...areaMap.values()].flat()),
      areas,
    }
  })

  return { district: tallyDistinguished(all), divisions }
}
