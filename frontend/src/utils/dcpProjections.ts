/**
 * DCP Projections Utility (#6)
 *
 * Pure calculation module for per-club Distinguished Club Program projections.
 * Computes gaps to each distinguished tier and projects year-end membership
 * using April renewal data.
 *
 * Tier thresholds (from ClubEligibilityUtils / §3.2):
 * - Distinguished:     5 goals + (20 members OR net growth ≥ 3)
 * - Select:            7 goals + (20 members OR net growth ≥ 5)
 * - President's:       9 goals + 20 members
 * - Smedley:          10 goals + 25 members
 *
 * NOTE: This module does NOT change existing distinguished classification.
 * It provides additive projections for district leaders (issue #6 constraint).
 */

import {
  determineDistinguishedLevel,
  getCSPStatus,
  isClubSmedleyAvailable,
} from '@taverns-red/analytics-core'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'

// --- Types ---

export type DistinguishedLevel =
  'NotDistinguished' | 'Distinguished' | 'Select' | 'President' | 'Smedley'

export interface TierGap {
  goals: number
  members: number
}

export interface ClubDCPProjection {
  clubId: string
  clubName: string
  division: string
  area: string
  currentGoals: number
  currentMembers: number
  membershipBase: number
  aprilRenewals: number | null
  projectedMembers: number
  currentLevel: DistinguishedLevel
  projectedLevel: DistinguishedLevel
  gapToDistinguished: TierGap
  gapToSelect: TierGap
  gapToPresident: TierGap
  gapToSmedley: TierGap
  closestTierAbove: string | null
}

// --- Core Functions ---

/**
 * Determine distinguished level from goals + membership.
 *
 * Delegates the ladder to analytics-core's `determineDistinguishedLevel`
 * (#1406) rather than restating it, so the rungs — and which of them existed
 * in `programYear` — have one definition. The club Smedley rung was added for
 * 2025-26; before that the ladder topped out at President's.
 *
 * CSP gate (#1139): from 2025-2026 a club without a submitted Club Success
 * Plan cannot reach any distinguished level. `cspSubmitted` is the value the
 * shared `getCSPStatus` rule has already normalized (undefined → true for
 * pre-2025-26 historical data), so this gate stays in lockstep with
 * analytics-core's distinguished paths.
 */
function determineLevel(
  goals: number,
  members: number,
  netGrowth: number,
  cspSubmitted: boolean,
  programYear?: string
): DistinguishedLevel {
  if (!cspSubmitted) return 'NotDistinguished'
  return determineDistinguishedLevel(goals, members, netGrowth, programYear)
}

/**
 * Compute the gap (goals + members remaining) to reach a tier.
 *
 * For tiers with a net growth alternative (Distinguished, Select),
 * the member gap is min(path-to-20-members, path-to-growth-threshold).
 * This means if a club already meets the growth alternative, members gap = 0.
 */
function computeGap(
  currentGoals: number,
  currentMembers: number,
  tierGoals: number,
  tierMembers: number,
  netGrowth?: number,
  growthThreshold?: number
): TierGap {
  const goalGap = Math.max(0, tierGoals - currentGoals)

  // Path A: absolute membership minimum
  const memberGapAbsolute = Math.max(0, tierMembers - currentMembers)

  // Path B: net growth alternative (if applicable)
  if (netGrowth !== undefined && growthThreshold !== undefined) {
    const growthGap = Math.max(0, growthThreshold - netGrowth)
    return {
      goals: goalGap,
      members: Math.min(memberGapAbsolute, growthGap),
    }
  }

  return {
    goals: goalGap,
    members: memberGapAbsolute,
  }
}

/**
 * Extract the latest value from a trend array.
 */
function latestGoals(
  trend: Array<{ date: string; goalsAchieved: number }>
): number {
  if (trend.length === 0) return 0
  return trend[trend.length - 1]!.goalsAchieved
}

function latestMembership(
  trend: Array<{ date: string; count: number }>
): number {
  if (trend.length === 0) return 0
  return trend[trend.length - 1]!.count
}

/**
 * Calculate DCP projection for a single club.
 *
 * @param club - Club trend data
 * @param programYear - Program year the trend belongs to ("YYYY-YYYY"),
 *   threaded from the page that owns the program-year selection (#1406).
 *   Decides which rungs the club could reach and which tier gaps are worth
 *   showing. Omitted → current rules.
 */
export function calculateClubProjection(
  club: ClubTrend,
  programYear?: string
): ClubDCPProjection {
  const currentGoals = latestGoals(club.dcpGoalsTrend)
  const currentMembers = latestMembership(club.membershipTrend)
  const aprilRenewals =
    club.aprilRenewals !== undefined && club.aprilRenewals !== null
      ? club.aprilRenewals
      : null

  // Use the canonical membership base (program year start), falling back to
  // the earliest trend point or current membership.
  const membershipBase =
    club.membershipBase ??
    (club.membershipTrend.length > 0
      ? club.membershipTrend[0]!.count
      : currentMembers)

  // Project year-end membership. April renewals are renewal PAYMENTS made by
  // members who are already counted in currentMembers, so adding them
  // double-counts membership (#1116 item 3 / §4.1). Without a forward
  // retention model the honest year-end estimate is the current membership;
  // aprilRenewals is surfaced separately as an informational signal.
  const projectedMembers = currentMembers

  const netGrowth = currentMembers - membershipBase

  // CSP gate (#1139): source the rule from analytics-core so a CSP-less club
  // is never projected Distinguished (undefined → submitted for historical).
  const cspSubmitted = getCSPStatus(club)

  const currentLevel = determineLevel(
    currentGoals,
    currentMembers,
    netGrowth,
    cspSubmitted,
    programYear
  )
  // projectedMembers === currentMembers (no April-renewal inflation, #1116
  // item 3), so the projected level is identical to the current level.
  const projectedLevel = currentLevel

  const gapToDistinguished = computeGap(
    currentGoals,
    currentMembers,
    5,
    20,
    netGrowth,
    3
  )
  const gapToSelect = computeGap(
    currentGoals,
    currentMembers,
    7,
    20,
    netGrowth,
    5
  )
  const gapToPresident = computeGap(currentGoals, currentMembers, 9, 20)
  // A gap to a rung that did not exist that year is not a goal anyone could
  // have chased (#1406) — report it as already-closed so no surface offers
  // "2 members from Smedley" for a 2023-24 club.
  const smedleyReachable = isClubSmedleyAvailable(programYear)
  const gapToSmedley = smedleyReachable
    ? computeGap(currentGoals, currentMembers, 10, 25)
    : { goals: 0, members: 0 }

  const projection: ClubDCPProjection = {
    clubId: club.clubId,
    clubName: club.clubName,
    division: club.divisionId,
    area: club.areaId,
    currentGoals,
    currentMembers,
    membershipBase,
    aprilRenewals,
    projectedMembers,
    currentLevel,
    projectedLevel,
    gapToDistinguished,
    gapToSelect,
    gapToPresident,
    gapToSmedley,
    closestTierAbove: null, // filled below
  }

  projection.closestTierAbove = getClosestTierLabel(projection, {
    smedleyReachable,
  })

  return projection
}

/**
 * Generate a human-readable label for the closest tier above the current level.
 * Returns null if the club is already at the highest tier (Smedley).
 */
export function getClosestTierLabel(
  projection: ClubDCPProjection,
  options: { smedleyReachable?: boolean } = {}
): string | null {
  const { smedleyReachable = true } = options
  const tierOrder: DistinguishedLevel[] = [
    'NotDistinguished',
    'Distinguished',
    'Select',
    'President',
    'Smedley',
  ]
  const currentIndex = tierOrder.indexOf(projection.currentLevel)

  // Already at Smedley
  if (currentIndex >= tierOrder.length - 1) return null

  // Find the next tier above
  const gaps: Array<{ tier: string; gap: TierGap }> = [
    { tier: 'Distinguished', gap: projection.gapToDistinguished },
    { tier: 'Select', gap: projection.gapToSelect },
    { tier: "President's", gap: projection.gapToPresident },
    // Smedley is only a tier to aim at in a year that had it (#1406).
    ...(smedleyReachable
      ? [{ tier: 'Smedley', gap: projection.gapToSmedley }]
      : []),
  ]

  // Find the first tier above current that has a non-zero gap
  for (const { tier, gap } of gaps) {
    const tierIndex = tierOrder.indexOf(
      tier === "President's" ? 'President' : (tier as DistinguishedLevel)
    )
    if (tierIndex <= currentIndex) continue

    const parts: string[] = []
    if (gap.goals > 0)
      parts.push(`${gap.goals} goal${gap.goals > 1 ? 's' : ''}`)
    if (gap.members > 0)
      parts.push(`${gap.members} member${gap.members > 1 ? 's' : ''}`)

    if (parts.length === 0) {
      // Already meets this tier's requirements (but level wasn't assigned because of ordering)
      continue
    }

    return `${parts.join(' + ')} from ${tier}`
  }

  return null
}

/**
 * Calculate DCP projections for a batch of clubs.
 */
export function calculateClubProjections(
  clubs: ClubTrend[],
  programYear?: string
): ClubDCPProjection[] {
  return clubs.map(club => calculateClubProjection(club, programYear))
}
