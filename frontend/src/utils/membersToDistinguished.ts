/**
 * Members-to-Distinguished Utility (#273)
 *
 * Identifies clubs where adding members is the **only** barrier to becoming
 * Distinguished. The calculation is nuanced because new members can
 * simultaneously:
 *
 *   1. Satisfy the membership/net-growth qualification requirement
 *   2. Earn DCP Goal 7 (4 new members) → 1 DCP point
 *   3. Earn DCP Goal 8 (4 more new members) → 1 DCP point
 *
 * A club qualifies as "only needs members" when:
 *   - It is not already Distinguished (or higher)
 *   - The remaining DCP goal gap can be fully closed by earning Goal 7 and/or Goal 8
 *   - The remaining membership qualification gap can be closed by the same members
 *
 * Tier requirements (§3.2):
 *   Distinguished: 5 goals + (20 members OR net growth ≥ 3)
 */

import type { ClubDCPProjection } from './dcpProjections'

export interface MembersToDistinguishedResult {
  /** Number of additional members needed */
  membersNeeded: number
  /** Human-readable explanation */
  reason: string
  /** Which DCP goals would be earned by adding these members */
  goalsEarned: number[]
  /** Whether the members are needed for qualification (growth/absolute), goals, or both */
  satisfies: ('qualification' | 'goal7' | 'goal8')[]
}

export interface ClubGoalContext {
  /** Number of new members already added this program year */
  newMembersSoFar: number
  /** Whether Goal 7 (4 new members) has already been achieved */
  goal7Achieved: boolean
  /** Whether Goal 8 (4 more new members) has already been achieved */
  goal8Achieved: boolean
}

const GOAL_7_REQUIRED = 4
const GOAL_8_REQUIRED = 4
const DISTINGUISHED_GOALS = 5
const DISTINGUISHED_MEMBERS = 20
const NET_GROWTH_THRESHOLD = 3

/**
 * Compute how many additional members a club needs to become Distinguished,
 * or null if members alone cannot close the gap.
 */
export function computeMembersToDistinguished(
  projection: ClubDCPProjection,
  goalContext: ClubGoalContext
): MembersToDistinguishedResult | null {
  // Already distinguished or higher — nothing to do
  if (projection.currentLevel !== 'NotDistinguished') {
    return null
  }

  const { currentGoals, currentMembers, membershipBase } = projection
  const { newMembersSoFar, goal7Achieved, goal8Achieved } = goalContext

  // --- Step 1: How many DCP goals can members earn? ---
  const goalGap = Math.max(0, DISTINGUISHED_GOALS - currentGoals)

  // If gap is already 0 for goals, check if membership qualification is also met
  if (goalGap === 0) {
    // Goals are sufficient — check membership qualification
    const membersForQualification = computeMembersForQualification(
      currentMembers,
      membershipBase
    )
    if (membersForQualification === 0) {
      // Already qualifies — shouldn't be NotDistinguished but data may lag
      return null
    }
    return {
      membersNeeded: membersForQualification,
      reason: `${membersForQualification} member${membersForQualification > 1 ? 's' : ''} needed for membership qualification`,
      goalsEarned: [],
      satisfies: ['qualification'],
    }
  }

  // --- Step 2: Can member-based goals close the DCP gap? ---
  let goalsFromMembers = 0
  const goalsEarned: number[] = []
  const satisfies: ('qualification' | 'goal7' | 'goal8')[] = []
  let totalNewMembersRequired = 0

  // Goal 7: 4 new members
  if (!goal7Achieved && goalGap > goalsFromMembers) {
    goalsFromMembers += 1
    goalsEarned.push(7)
    satisfies.push('goal7')
    const remainingForGoal7 = Math.max(0, GOAL_7_REQUIRED - newMembersSoFar)
    totalNewMembersRequired += remainingForGoal7
  }

  // Goal 8: 4 more new members (only if Goal 7 is achieved or being earned)
  if (
    !goal8Achieved &&
    goalGap > goalsFromMembers &&
    (goal7Achieved || goalsEarned.includes(7))
  ) {
    goalsFromMembers += 1
    goalsEarned.push(8)
    satisfies.push('goal8')
    // If Goal 7 is already achieved, count progress toward Goal 8
    const progressTowardGoal8 = goal7Achieved
      ? Math.max(0, newMembersSoFar - GOAL_7_REQUIRED)
      : 0
    const remainingForGoal8 = Math.max(0, GOAL_8_REQUIRED - progressTowardGoal8)
    totalNewMembersRequired += remainingForGoal8
  }

  // Can member goals close the DCP gap?
  if (goalsFromMembers < goalGap) {
    // Not enough — club needs non-member goals too
    return null
  }

  // --- Step 3: Also need membership qualification? ---
  const projectedMembers = currentMembers + totalNewMembersRequired
  const projectedNetGrowth = projectedMembers - membershipBase
  const meetsAbsolute = projectedMembers >= DISTINGUISHED_MEMBERS
  const meetsGrowth = projectedNetGrowth >= NET_GROWTH_THRESHOLD

  if (!meetsAbsolute && !meetsGrowth) {
    // Adding members for goals isn't enough for qualification — need more
    const extraForQualification = computeMembersForQualification(
      projectedMembers,
      membershipBase
    )
    totalNewMembersRequired += extraForQualification
    satisfies.push('qualification')
  }

  // Also check if current membership needs qualification boost even when
  // totalNewMembersRequired covers goal gap
  const finalMembers = currentMembers + totalNewMembersRequired
  const finalNetGrowth = finalMembers - membershipBase
  if (
    finalMembers < DISTINGUISHED_MEMBERS &&
    finalNetGrowth < NET_GROWTH_THRESHOLD &&
    !satisfies.includes('qualification')
  ) {
    const extra = computeMembersForQualification(finalMembers, membershipBase)
    totalNewMembersRequired += extra
    satisfies.push('qualification')
  }

  if (totalNewMembersRequired === 0) {
    return null
  }

  // --- Step 4: Build result ---
  const goalParts = goalsEarned.map(g => `Goal ${g}`)
  const parts: string[] = []
  if (goalParts.length > 0) {
    parts.push(goalParts.join(' + '))
  }
  if (satisfies.includes('qualification')) {
    parts.push('membership qualification')
  }

  return {
    membersNeeded: totalNewMembersRequired,
    reason: `${totalNewMembersRequired} member${totalNewMembersRequired > 1 ? 's' : ''} needed for ${parts.join(' and ')}`,
    goalsEarned,
    satisfies,
  }
}

/**
 * Compute how many additional members are needed to meet either:
 *   - 20 absolute members, OR
 *   - net growth ≥ 3
 * Returns the minimum of the two paths.
 */
function computeMembersForQualification(
  currentMembers: number,
  membershipBase: number
): number {
  const netGrowth = currentMembers - membershipBase
  const absoluteGap = Math.max(0, DISTINGUISHED_MEMBERS - currentMembers)
  const growthGap = Math.max(0, NET_GROWTH_THRESHOLD - netGrowth)
  return Math.min(absoluteGap, growthGap)
}
