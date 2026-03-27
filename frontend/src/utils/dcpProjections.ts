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

import type { ClubTrend } from '../hooks/useDistrictAnalytics'

// --- Types ---

export type DistinguishedLevel =
  | 'NotDistinguished'
  | 'Distinguished'
  | 'Select'
  | 'President'
  | 'Smedley'

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
 * Mirrors ClubEligibilityUtils.determineDistinguishedLevel but operates
 * on raw numbers without needing ClubStatistics.
 */
function determineLevel(
  goals: number,
  members: number,
  netGrowth: number
): DistinguishedLevel {
  if (goals >= 10 && members >= 25) return 'Smedley'
  if (goals >= 9 && members >= 20) return 'President'
  if (goals >= 7 && (members >= 20 || netGrowth >= 5)) return 'Select'
  if (goals >= 5 && (members >= 20 || netGrowth >= 3)) return 'Distinguished'
  return 'NotDistinguished'
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
 */
export function calculateClubProjection(club: ClubTrend): ClubDCPProjection {
  const currentGoals = latestGoals(club.dcpGoalsTrend)
  const currentMembers = latestMembership(club.membershipTrend)
  const aprilRenewals =
    club.aprilRenewals !== undefined && club.aprilRenewals !== null
      ? club.aprilRenewals
      : null

  // Estimate membership base from earliest trend point or current
  const membershipBase =
    club.membershipTrend.length > 0
      ? club.membershipTrend[0]!.count
      : currentMembers

  // Project year-end membership:
  // If April renewals available, assume renewals represent re-committed members
  // projected = currentMembers + aprilRenewals (additive signal)
  // If not available, use current members as projection
  const projectedMembers =
    aprilRenewals !== null ? currentMembers + aprilRenewals : currentMembers

  const netGrowth = currentMembers - membershipBase

  const currentLevel = determineLevel(currentGoals, currentMembers, netGrowth)
  const projectedNetGrowth = projectedMembers - membershipBase
  const projectedLevel = determineLevel(
    currentGoals,
    projectedMembers,
    projectedNetGrowth
  )

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
  const gapToSmedley = computeGap(currentGoals, currentMembers, 10, 25)

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

  projection.closestTierAbove = getClosestTierLabel(projection)

  return projection
}

/**
 * Generate a human-readable label for the closest tier above the current level.
 * Returns null if the club is already at the highest tier (Smedley).
 */
export function getClosestTierLabel(
  projection: ClubDCPProjection
): string | null {
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
    { tier: 'Smedley', gap: projection.gapToSmedley },
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
  clubs: ClubTrend[]
): ClubDCPProjection[] {
  return clubs.map(calculateClubProjection)
}
