/**
 * Tests for computeMembersToDistinguished utility (#273)
 *
 * Identifies clubs where adding members is the only barrier to becoming
 * Distinguished. The calculation accounts for the fact that new members
 * can simultaneously:
 *   1. Satisfy the membership/net-growth qualification requirement
 *   2. Earn DCP Goal 7 (4 new members) and Goal 8 (4 more new members)
 *
 * Tier requirements (§3.2):
 *   Distinguished: 5 goals + (20 members OR net growth ≥ 3)
 */
import { describe, it, expect } from 'vitest'
import { computeMembersToDistinguished } from '../membersToDistinguished'
import type { ClubDCPProjection } from '../dcpProjections'

// Helper to build a minimal ClubDCPProjection for testing
function makeProjection(
  overrides: Partial<ClubDCPProjection>
): ClubDCPProjection {
  return {
    clubId: '1234',
    clubName: 'Test Club',
    division: 'A',
    area: '1',
    currentGoals: 0,
    currentMembers: 15,
    membershipBase: 15,
    aprilRenewals: null,
    projectedMembers: 15,
    currentLevel: 'NotDistinguished',
    projectedLevel: 'NotDistinguished',
    gapToDistinguished: { goals: 5, members: 5 },
    gapToSelect: { goals: 7, members: 5 },
    gapToPresident: { goals: 9, members: 5 },
    gapToSmedley: { goals: 10, members: 10 },
    closestTierAbove: null,
    ...overrides,
  }
}

describe('computeMembersToDistinguished', () => {
  it('should return null for clubs already distinguished', () => {
    const projection = makeProjection({
      currentLevel: 'Distinguished',
      currentGoals: 6,
      currentMembers: 22,
      gapToDistinguished: { goals: 0, members: 0 },
    })

    const result = computeMembersToDistinguished(projection, {
      newMembersSoFar: 0,
      goal7Achieved: true,
      goal8Achieved: false,
    })

    expect(result).toBeNull()
  })

  it('should return null for clubs that need non-member goals (education, training, admin)', () => {
    // Club has 0 DCP goals, needs 5 for Distinguished
    // Even with Goal 7 + Goal 8 (2 goals), they'd only have 2...not enough
    const projection = makeProjection({
      currentGoals: 0,
      currentMembers: 20,
      membershipBase: 15,
      gapToDistinguished: { goals: 5, members: 0 },
    })

    const result = computeMembersToDistinguished(projection, {
      newMembersSoFar: 0,
      goal7Achieved: false,
      goal8Achieved: false,
    })

    // Needs 5 goals but can only earn 2 from members (Goal 7 + Goal 8)
    // So members alone cannot close the gap
    expect(result).toBeNull()
  })

  describe('clubs where members alone can close the gap', () => {
    it('should identify club needing 2 members (the issue example)', () => {
      // Club: base=15, current=16, goals=4 (points 4,5,9,10), newMembers=2
      // Goal 7 needs 4 new members, has 2 toward it
      // Needs 2 more members → achieves Goal 7 (5th DCP point)
      // Net growth becomes 16-15+2=3, which qualifies via growth path
      const projection = makeProjection({
        currentGoals: 4,
        currentMembers: 16,
        membershipBase: 15,
        gapToDistinguished: { goals: 1, members: 0 },
      })

      const result = computeMembersToDistinguished(projection, {
        newMembersSoFar: 2,
        goal7Achieved: false,
        goal8Achieved: false,
      })

      expect(result).not.toBeNull()
      expect(result!.membersNeeded).toBe(2)
      expect(result!.reason).toContain('Goal 7')
    })

    it('should identify club needing members for Goal 7 only', () => {
      // Club has 4 goals, needs 1 more. Goal 7 not achieved (0 new members so far)
      // Needs 4 new members to earn Goal 7 → 5th DCP point
      // With 20 members already, membership qualification is met
      const projection = makeProjection({
        currentGoals: 4,
        currentMembers: 20,
        membershipBase: 18,
        gapToDistinguished: { goals: 1, members: 0 },
      })

      const result = computeMembersToDistinguished(projection, {
        newMembersSoFar: 0,
        goal7Achieved: false,
        goal8Achieved: false,
      })

      expect(result).not.toBeNull()
      expect(result!.membersNeeded).toBe(4)
    })

    it('should account for partial progress toward Goal 7', () => {
      // Club has 4 goals, 3 new members toward Goal 7 (needs 4)
      // Only needs 1 more new member to earn Goal 7
      const projection = makeProjection({
        currentGoals: 4,
        currentMembers: 20,
        membershipBase: 17,
        gapToDistinguished: { goals: 1, members: 0 },
      })

      const result = computeMembersToDistinguished(projection, {
        newMembersSoFar: 3,
        goal7Achieved: false,
        goal8Achieved: false,
      })

      expect(result).not.toBeNull()
      expect(result!.membersNeeded).toBe(1)
    })

    it('should handle club needing Goal 8 when Goal 7 already achieved', () => {
      // Club has 4 goals (including Goal 7 already), needs Goal 8
      // Goal 8 needs 4 additional new members
      // Has 5 new members so far (4 for Goal 7 + 1 toward Goal 8)
      const projection = makeProjection({
        currentGoals: 4,
        currentMembers: 22,
        membershipBase: 17,
        gapToDistinguished: { goals: 1, members: 0 },
      })

      const result = computeMembersToDistinguished(projection, {
        newMembersSoFar: 5,
        goal7Achieved: true,
        goal8Achieved: false,
      })

      expect(result).not.toBeNull()
      expect(result!.membersNeeded).toBe(3) // 4 needed for Goal 8, 1 already toward it
      expect(result!.reason).toContain('Goal 8')
    })

    it('should also account for membership qualification gap', () => {
      // Club has 4 goals, needs 1 more (can get from Goal 7)
      // But only has 16 members with base=15, needs net growth ≥ 3
      // Currently net growth = 1, needs 2 more for growth path
      // But also needs 4 total new members for Goal 7 (has 0 so far)
      // So needs max(4 for Goal 7, 2 for growth) = 4
      const projection = makeProjection({
        currentGoals: 4,
        currentMembers: 16,
        membershipBase: 15,
        gapToDistinguished: { goals: 1, members: 0 },
      })

      const result = computeMembersToDistinguished(projection, {
        newMembersSoFar: 0,
        goal7Achieved: false,
        goal8Achieved: false,
      })

      expect(result).not.toBeNull()
      // Needs 4 for Goal 7, but net growth after 4 members = 16-15+4 = 5 ≥ 3 ✓
      // So 4 members satisfies both Goal 7 AND qualification
      expect(result!.membersNeeded).toBe(4)
    })

    it('should return null when too many non-member goals are needed', () => {
      // Club has 2 goals, needs 3 more for Distinguished
      // Can earn at most 2 from members (Goal 7 + Goal 8)
      // Still 1 goal short — needs a non-member goal
      const projection = makeProjection({
        currentGoals: 2,
        currentMembers: 20,
        membershipBase: 15,
        gapToDistinguished: { goals: 3, members: 0 },
      })

      const result = computeMembersToDistinguished(projection, {
        newMembersSoFar: 0,
        goal7Achieved: false,
        goal8Achieved: false,
      })

      expect(result).toBeNull()
    })

    it('should handle club needing both Goal 7 and Goal 8', () => {
      // Club has 3 goals, needs 2 more = Goal 7 + Goal 8
      // 0 new members so far
      // Needs 8 new members total (4 for Goal 7 + 4 for Goal 8)
      const projection = makeProjection({
        currentGoals: 3,
        currentMembers: 20,
        membershipBase: 15,
        gapToDistinguished: { goals: 2, members: 0 },
      })

      const result = computeMembersToDistinguished(projection, {
        newMembersSoFar: 0,
        goal7Achieved: false,
        goal8Achieved: false,
      })

      expect(result).not.toBeNull()
      expect(result!.membersNeeded).toBe(8) // 4 for Goal 7 + 4 for Goal 8
    })
  })

  describe('edge cases', () => {
    it('should handle club at exactly 5 goals needing only membership qualification', () => {
      // Has 5 DCP goals already — goals gap is 0
      // But only 18 members with base=17, net growth=1 (needs ≥3)
      // Needs 2 more members for net growth qualification
      const projection = makeProjection({
        currentGoals: 5,
        currentMembers: 18,
        membershipBase: 17,
        gapToDistinguished: { goals: 0, members: 2 },
      })

      const result = computeMembersToDistinguished(projection, {
        newMembersSoFar: 1,
        goal7Achieved: true,
        goal8Achieved: false,
      })

      expect(result).not.toBeNull()
      expect(result!.membersNeeded).toBe(2)
      expect(result!.reason).toContain('qualification')
    })

    it('should return membersNeeded=0 when club qualifies but system has not classified yet', () => {
      // Edge: club meets all requirements but currentLevel is still NotDistinguished
      // (maybe data lag). Should return null since effectively already distinguished
      const projection = makeProjection({
        currentGoals: 5,
        currentMembers: 22,
        membershipBase: 15,
        currentLevel: 'NotDistinguished',
        gapToDistinguished: { goals: 0, members: 0 },
      })

      const result = computeMembersToDistinguished(projection, {
        newMembersSoFar: 4,
        goal7Achieved: true,
        goal8Achieved: false,
      })

      // Gap is 0 for both goals and members — already qualifies
      expect(result).toBeNull()
    })
  })
})
