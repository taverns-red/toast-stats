/**
 * DistinguishedClubAnalyticsModule Unit Tests
 *
 * Tests for threshold classification of distinguished clubs.
 * Per testing.md Section 7.3: "Would 5 well-chosen examples provide equivalent confidence?
 * If yes, prefer the examples." - These boundary tests are clearer than properties.
 *
 * Requirements: 3.2 (Smedley threshold check)
 */

import { describe, it, expect } from 'vitest'
import { DistinguishedClubAnalyticsModule } from '../analytics/DistinguishedClubAnalyticsModule.js'
import type { DistrictStatistics, ClubStatistics } from '../interfaces.js'

/**
 * Helper to create a mock club with specified goals and membership
 * By default, membershipBase equals membershipCount (net growth = 0)
 * to test pure membership thresholds without net growth influence.
 */
function createMockClub(
  clubId: string,
  dcpGoals: number,
  membershipCount: number,
  membershipBase?: number
): ClubStatistics {
  return {
    clubId,
    clubName: `Test Club ${clubId}`,
    divisionId: 'A',
    areaId: 'A1',
    divisionName: 'Division A',
    areaName: 'Area A1',
    membershipCount,
    paymentsCount: membershipCount,
    dcpGoals,
    status: 'Active',
    octoberRenewals: Math.floor(membershipCount * 0.4),
    aprilRenewals: Math.floor(membershipCount * 0.3),
    newMembers: Math.floor(membershipCount * 0.3),
    // Default to membershipCount so net growth = 0 (tests pure membership threshold)
    membershipBase: membershipBase ?? membershipCount,
  }
}

/**
 * Helper to create a mock district statistics snapshot with given clubs
 */
function createMockSnapshot(clubs: ClubStatistics[]): DistrictStatistics {
  const totalMembership = clubs.reduce((sum, c) => sum + c.membershipCount, 0)
  const totalPayments = clubs.reduce((sum, c) => sum + c.paymentsCount, 0)

  return {
    districtId: 'D101',
    snapshotDate: '2024-01-15',
    clubs,
    divisions: [],
    areas: [],
    totals: {
      totalClubs: clubs.length,
      totalMembership,
      totalPayments,
      distinguishedClubs: clubs.filter(c => c.dcpGoals >= 5).length,
      selectDistinguishedClubs: clubs.filter(c => c.dcpGoals >= 7).length,
      presidentDistinguishedClubs: clubs.filter(c => c.dcpGoals >= 9).length,
    },
    clubPerformance: [],
    divisionPerformance: [],
    districtPerformance: [],
  }
}

describe('DistinguishedClubAnalyticsModule', () => {
  describe('Threshold Classification (Req 3.2)', () => {
    /**
     * Recognition Level Thresholds:
     * | Level       | Goals Required | Members Required |
     * |-------------|---------------|------------------|
     * | Smedley     | 10+           | 25+              |
     * | President's | 9+            | 20+              |
     * | Select      | 7+            | 20+              |
     * | Distinguished | 5+          | 20+              |
     */

    describe('Smedley Distinguished (10+ goals, 25+ members)', () => {
      it('should classify club with exactly 10 goals and 25 members as smedley', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 10, 25)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('smedley')
      })

      it('should classify club with 10 goals but only 24 members as president (not smedley)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 10, 24)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('president')
      })

      it('should classify club with 9 goals and 25 members as president (not smedley)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 9, 25)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('president')
      })

      it('should classify club with more than 10 goals and 25+ members as smedley', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 12, 30)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('smedley')
      })
    })

    describe("President's Distinguished (9+ goals, 20+ members)", () => {
      it('should classify club with exactly 9 goals and 20 members as president', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 9, 20)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('president')
      })

      it('should classify club with 9 goals but only 19 members as none (not president)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 9, 19)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        // Club doesn't meet minimum membership requirement for any distinguished level
        expect(summaries).toHaveLength(0)
      })

      it('should classify club with 8 goals and 20 members as select (not president)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 8, 20)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('select')
      })
    })

    describe('Select Distinguished (7+ goals, 20+ members)', () => {
      it('should classify club with exactly 7 goals and 20 members as select', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 7, 20)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('select')
      })

      it('should classify club with 6 goals and 20 members as distinguished (not select)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 6, 20)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('distinguished')
      })
    })

    describe('Distinguished (5+ goals, 20+ members)', () => {
      it('should classify club with exactly 5 goals and 20 members as distinguished', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 5, 20)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('distinguished')
      })

      it('should classify club with 4 goals and 20 members as none (not distinguished)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 4, 20)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        // Club doesn't meet minimum goals requirement for any distinguished level
        expect(summaries).toHaveLength(0)
      })

      it('should classify club with 5 goals but only 19 members as none', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 5, 19)
        const snapshot = createMockSnapshot([club])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        // Club doesn't meet minimum membership requirement
        expect(summaries).toHaveLength(0)
      })
    })

    describe('generateDistinguishedClubCounts threshold verification', () => {
      it('should count smedley club correctly (10 goals, 25 members)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 10, 25)
        const snapshot = createMockSnapshot([club])

        const counts = module.generateDistinguishedClubCounts([snapshot])

        expect(counts.smedley).toBe(1)
        expect(counts.presidents).toBe(0)
        expect(counts.select).toBe(0)
        expect(counts.distinguished).toBe(0)
        expect(counts.total).toBe(1)
      })

      it('should count president club correctly (9 goals, 20 members)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 9, 20)
        const snapshot = createMockSnapshot([club])

        const counts = module.generateDistinguishedClubCounts([snapshot])

        expect(counts.smedley).toBe(0)
        expect(counts.presidents).toBe(1)
        expect(counts.select).toBe(0)
        expect(counts.distinguished).toBe(0)
        expect(counts.total).toBe(1)
      })

      it('should count select club correctly (7 goals, 20 members)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 7, 20)
        const snapshot = createMockSnapshot([club])

        const counts = module.generateDistinguishedClubCounts([snapshot])

        expect(counts.smedley).toBe(0)
        expect(counts.presidents).toBe(0)
        expect(counts.select).toBe(1)
        expect(counts.distinguished).toBe(0)
        expect(counts.total).toBe(1)
      })

      it('should count distinguished club correctly (5 goals, 20 members)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 5, 20)
        const snapshot = createMockSnapshot([club])

        const counts = module.generateDistinguishedClubCounts([snapshot])

        expect(counts.smedley).toBe(0)
        expect(counts.presidents).toBe(0)
        expect(counts.select).toBe(0)
        expect(counts.distinguished).toBe(1)
        expect(counts.total).toBe(1)
      })

      it('should return zero counts for club not meeting any threshold (4 goals, 20 members)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 4, 20)
        const snapshot = createMockSnapshot([club])

        const counts = module.generateDistinguishedClubCounts([snapshot])

        expect(counts.smedley).toBe(0)
        expect(counts.presidents).toBe(0)
        expect(counts.select).toBe(0)
        expect(counts.distinguished).toBe(0)
        expect(counts.total).toBe(0)
      })

      it('should return zero counts for club with insufficient membership (10 goals, 19 members)', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const club = createMockClub('1', 10, 19)
        const snapshot = createMockSnapshot([club])

        const counts = module.generateDistinguishedClubCounts([snapshot])

        expect(counts.smedley).toBe(0)
        expect(counts.presidents).toBe(0)
        expect(counts.select).toBe(0)
        expect(counts.distinguished).toBe(0)
        expect(counts.total).toBe(0)
      })
    })

    describe('Edge cases', () => {
      it('should return empty summaries for empty snapshots', () => {
        const module = new DistinguishedClubAnalyticsModule()

        const summaries = module.generateDistinguishedClubSummaries([])

        expect(summaries).toHaveLength(0)
      })

      it('should return zero counts for empty snapshots', () => {
        const module = new DistinguishedClubAnalyticsModule()

        const counts = module.generateDistinguishedClubCounts([])

        expect(counts.smedley).toBe(0)
        expect(counts.presidents).toBe(0)
        expect(counts.select).toBe(0)
        expect(counts.distinguished).toBe(0)
        expect(counts.total).toBe(0)
      })

      it('should return empty summaries for snapshot with no clubs', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const snapshot = createMockSnapshot([])

        const summaries = module.generateDistinguishedClubSummaries([snapshot])

        expect(summaries).toHaveLength(0)
      })

      it('should return zero counts for snapshot with no clubs', () => {
        const module = new DistinguishedClubAnalyticsModule()
        const snapshot = createMockSnapshot([])

        const counts = module.generateDistinguishedClubCounts([snapshot])

        expect(counts.smedley).toBe(0)
        expect(counts.presidents).toBe(0)
        expect(counts.select).toBe(0)
        expect(counts.distinguished).toBe(0)
        expect(counts.total).toBe(0)
      })

      it('should use the latest snapshot when multiple snapshots provided', () => {
        const module = new DistinguishedClubAnalyticsModule()

        // First snapshot: club has 5 goals (distinguished)
        const snapshot1: DistrictStatistics = {
          ...createMockSnapshot([createMockClub('1', 5, 20)]),
          snapshotDate: '2024-01-01',
        }

        // Second snapshot: club has 10 goals and 25 members (smedley)
        const snapshot2: DistrictStatistics = {
          ...createMockSnapshot([createMockClub('1', 10, 25)]),
          snapshotDate: '2024-02-01',
        }

        const summaries = module.generateDistinguishedClubSummaries([
          snapshot1,
          snapshot2,
        ])

        expect(summaries).toHaveLength(1)
        expect(summaries[0]?.status).toBe('smedley')
      })
    })
  })

  describe('Projection Simplification (Req 1.1, 1.2)', () => {
    /**
     * Per Requirement 1.1: The projected year-end value equals the count of clubs with 'thriving' health status
     * Per Requirement 1.2: No differentiation by distinguished level - just whether they will be distinguished or better
     *
     * When thrivingCount is provided to generateDistinguishedProjection(), all projected* fields
     * should equal that count (projectedDistinguished, projectedSelect, projectedPresident).
     */

    describe('generateDistinguishedProjection with thrivingCount', () => {
      /**
       * Test: Projection equals thriving count for mixed health statuses
       *
       * Creates a snapshot with clubs in different health states:
       * - Thriving: membership >= 20 OR net growth >= 3, AND dcpGoals > 0
       * - Vulnerable: some requirements not met
       * - Intervention-required: membership < 12 AND net growth < 3
       *
       * Verifies that when thrivingCount is passed, projectedDistinguished equals that count.
       *
       * Validates: Requirement 1.1, 2.1, 2.2
       */
      it('should set projectedDistinguished to thrivingCount for mixed health statuses', () => {
        const module = new DistinguishedClubAnalyticsModule()

        // Create clubs with different health statuses:
        // Thriving clubs (membership >= 20 AND dcpGoals > 0):
        const thrivingClub1 = createMockClub('1', 3, 22) // 22 members, 3 goals - thriving
        const thrivingClub2 = createMockClub('2', 5, 20) // 20 members, 5 goals - thriving
        const thrivingClub3 = createMockClub('3', 1, 25) // 25 members, 1 goal - thriving

        // Vulnerable clubs (some requirements not met):
        const vulnerableClub1 = createMockClub('4', 0, 20) // 20 members, 0 goals - vulnerable (no DCP goals)
        const vulnerableClub2 = createMockClub('5', 2, 18) // 18 members, 2 goals - vulnerable (low membership, no net growth)

        // Intervention-required clubs (membership < 12 AND net growth < 3):
        const interventionClub = createMockClub('6', 1, 10) // 10 members, 1 goal - intervention required

        const snapshot = createMockSnapshot([
          thrivingClub1,
          thrivingClub2,
          thrivingClub3,
          vulnerableClub1,
          vulnerableClub2,
          interventionClub,
        ])

        // 3 thriving clubs out of 6 total
        const thrivingCount = 3

        const projection = module.generateDistinguishedProjection(
          [snapshot],
          thrivingCount
        )

        // projectedDistinguished should equal the thriving count (Req 1.1, 2.1, 2.2)
        // Note: projectedSelect and projectedPresident have been removed per Req 2.2
        expect(projection.projectedDistinguished).toBe(thrivingCount)

        // Current counts should reflect actual distinguished status (unchanged behavior)
        // Note: current counts are based on DCP goals/membership thresholds, not health status
        expect(projection.projectionDate).toBe(snapshot.snapshotDate)
      })

      /**
       * Test: Projection returns 0 when no thriving clubs
       *
       * Creates a snapshot with only vulnerable and intervention-required clubs
       * (no clubs meeting thriving criteria). When thrivingCount = 0 is passed,
       * projectedDistinguished should equal 0.
       *
       * Validates: Requirement 1.4, 2.1, 2.2
       */
      it('should return 0 for projectedDistinguished when thrivingCount is 0', () => {
        const module = new DistinguishedClubAnalyticsModule()

        // Create clubs that are NOT thriving:
        // Vulnerable clubs (some requirements not met):
        const vulnerableClub1 = createMockClub('1', 0, 20) // 20 members, 0 goals - vulnerable (no DCP goals)
        const vulnerableClub2 = createMockClub('2', 2, 18) // 18 members, 2 goals - vulnerable (low membership, no net growth)
        const vulnerableClub3 = createMockClub('3', 0, 15) // 15 members, 0 goals - vulnerable

        // Intervention-required clubs (membership < 12 AND net growth < 3):
        const interventionClub1 = createMockClub('4', 1, 10) // 10 members, 1 goal - intervention required
        const interventionClub2 = createMockClub('5', 0, 8) // 8 members, 0 goals - intervention required

        const snapshot = createMockSnapshot([
          vulnerableClub1,
          vulnerableClub2,
          vulnerableClub3,
          interventionClub1,
          interventionClub2,
        ])

        // No thriving clubs
        const thrivingCount = 0

        const projection = module.generateDistinguishedProjection(
          [snapshot],
          thrivingCount
        )

        // projectedDistinguished should equal 0 (Req 1.4, 2.1, 2.2)
        // Note: projectedSelect and projectedPresident have been removed per Req 2.2
        expect(projection.projectedDistinguished).toBe(0)

        // Verify projection date is still set correctly
        expect(projection.projectionDate).toBe(snapshot.snapshotDate)
      })

      /**
       * Test: Projection equals total club count when all clubs are thriving
       *
       * Creates a snapshot where ALL clubs meet thriving criteria:
       * - Membership >= 20 AND dcpGoals > 0
       *
       * When thrivingCount equals the total club count, projectedDistinguished
       * should equal that total count.
       *
       * Validates: Requirement 1.5, 2.1, 2.2
       */
      it('should set projectedDistinguished to total club count when all clubs are thriving', () => {
        const module = new DistinguishedClubAnalyticsModule()

        // Create clubs that ALL meet thriving criteria (membership >= 20 AND dcpGoals > 0):
        const thrivingClub1 = createMockClub('1', 3, 22) // 22 members, 3 goals - thriving
        const thrivingClub2 = createMockClub('2', 5, 20) // 20 members, 5 goals - thriving
        const thrivingClub3 = createMockClub('3', 1, 25) // 25 members, 1 goal - thriving
        const thrivingClub4 = createMockClub('4', 7, 30) // 30 members, 7 goals - thriving
        const thrivingClub5 = createMockClub('5', 10, 28) // 28 members, 10 goals - thriving

        const allClubs = [
          thrivingClub1,
          thrivingClub2,
          thrivingClub3,
          thrivingClub4,
          thrivingClub5,
        ]

        const snapshot = createMockSnapshot(allClubs)

        // All 5 clubs are thriving, so thrivingCount equals total club count
        const totalClubCount = allClubs.length
        const thrivingCount = totalClubCount

        const projection = module.generateDistinguishedProjection(
          [snapshot],
          thrivingCount
        )

        // projectedDistinguished should equal the total club count (Req 1.5, 2.1, 2.2)
        // Note: projectedSelect and projectedPresident have been removed per Req 2.2
        expect(projection.projectedDistinguished).toBe(totalClubCount)

        // Verify projection date is still set correctly
        expect(projection.projectionDate).toBe(snapshot.snapshotDate)
      })
    })
  })

  describe('No Double Counting (Req 3.3)', () => {
    /**
     * Per Requirement 3.3: WHEN counting distinguished clubs, THE DistinguishedClubAnalyticsModule
     * SHALL ensure each club is counted in exactly one category (the highest achieved level)
     *
     * This ensures clubs are not double-counted across multiple recognition levels.
     * A club that qualifies for multiple levels should only appear in the highest level.
     */

    it('should count club qualifying for smedley ONLY in smedley count (not in presidents/select/distinguished)', () => {
      const module = new DistinguishedClubAnalyticsModule()
      // Club with 10+ goals and 25+ members qualifies for ALL levels, but should only count as smedley
      const smedleyClub = createMockClub('1', 10, 25)
      const snapshot = createMockSnapshot([smedleyClub])

      const counts = module.generateDistinguishedClubCounts([snapshot])

      // Should appear ONLY in smedley
      expect(counts.smedley).toBe(1)
      expect(counts.presidents).toBe(0)
      expect(counts.select).toBe(0)
      expect(counts.distinguished).toBe(0)
      // Total should equal exactly 1 (no double counting)
      expect(counts.total).toBe(1)
    })

    it('should count club qualifying for president (but not smedley) ONLY in presidents count', () => {
      const module = new DistinguishedClubAnalyticsModule()
      // Club with 9 goals and 20 members qualifies for president, select, and distinguished
      // but NOT smedley (needs 10+ goals AND 25+ members)
      const presidentClub = createMockClub('1', 9, 20)
      const snapshot = createMockSnapshot([presidentClub])

      const counts = module.generateDistinguishedClubCounts([snapshot])

      // Should appear ONLY in presidents
      expect(counts.smedley).toBe(0)
      expect(counts.presidents).toBe(1)
      expect(counts.select).toBe(0)
      expect(counts.distinguished).toBe(0)
      // Total should equal exactly 1 (no double counting)
      expect(counts.total).toBe(1)
    })

    it('should produce correct exclusive counts for mixed set of clubs at different levels', () => {
      const module = new DistinguishedClubAnalyticsModule()

      // Create clubs at each recognition level
      const smedleyClub = createMockClub('1', 10, 25) // Smedley: 10+ goals, 25+ members
      const presidentClub = createMockClub('2', 9, 20) // President: 9+ goals, 20+ members
      const selectClub = createMockClub('3', 7, 20) // Select: 7+ goals, 20+ members
      const distinguishedClub = createMockClub('4', 5, 20) // Distinguished: 5+ goals, 20+ members
      const nonDistinguishedClub = createMockClub('5', 4, 20) // None: below threshold

      const snapshot = createMockSnapshot([
        smedleyClub,
        presidentClub,
        selectClub,
        distinguishedClub,
        nonDistinguishedClub,
      ])

      const counts = module.generateDistinguishedClubCounts([snapshot])

      // Each club should be counted in exactly one category
      expect(counts.smedley).toBe(1)
      expect(counts.presidents).toBe(1)
      expect(counts.select).toBe(1)
      expect(counts.distinguished).toBe(1)

      // Total should equal sum of individual counts (no double counting)
      expect(counts.total).toBe(4)
      expect(counts.total).toBe(
        counts.smedley +
          counts.presidents +
          counts.select +
          counts.distinguished
      )
    })

    it('should count multiple clubs at the same level correctly without double counting', () => {
      const module = new DistinguishedClubAnalyticsModule()

      // Multiple smedley clubs
      const smedleyClub1 = createMockClub('1', 10, 25)
      const smedleyClub2 = createMockClub('2', 12, 30)
      // Multiple president clubs
      const presidentClub1 = createMockClub('3', 9, 20)
      const presidentClub2 = createMockClub('4', 9, 24) // 24 members, not 25, so president not smedley

      const snapshot = createMockSnapshot([
        smedleyClub1,
        smedleyClub2,
        presidentClub1,
        presidentClub2,
      ])

      const counts = module.generateDistinguishedClubCounts([snapshot])

      expect(counts.smedley).toBe(2)
      expect(counts.presidents).toBe(2)
      expect(counts.select).toBe(0)
      expect(counts.distinguished).toBe(0)
      expect(counts.total).toBe(4)
      expect(counts.total).toBe(
        counts.smedley +
          counts.presidents +
          counts.select +
          counts.distinguished
      )
    })
  })

  describe('DCP Goal Analysis (#135)', () => {
    /**
     * Bug #135: analyzeDCPGoals() assumed goals are achieved sequentially
     * (Goal 1 first, then Goal 2, etc.) based on dcpGoals count.
     * This produced a monotonic staircase — Goal 1 always highest, Goal 10 always lowest.
     *
     * Fix: Use actual per-goal columns from raw clubPerformance CSV records.
     *
     * The raw CSV has columns: Level 1s, Level 2s, Add. Level 2s, Level 3s,
     * Level 4s/5s/DTM, Add. Level 4s/5s/DTM, New Members, Add. New Members,
     * Off. Trained Round 1, Off. Trained Round 2, Mem. dues on time Oct/Apr, Off. List On Time
     */
    it('should count goals from actual CSV columns, not assume sequential achievement', () => {
      const module = new DistinguishedClubAnalyticsModule()

      // Club A: achieved only Goal 7 (new members) and Goal 10 (admin compliance)
      // but NOT Goals 1-6 or 8-9
      const clubA = createMockClub('A', 2, 20) // 2 DCP goals total

      // Club B: achieved only Goal 1 (Level 1 awards) and Goal 9 (officer training)
      const clubB = createMockClub('B', 2, 20) // 2 DCP goals total

      // Create snapshot with raw clubPerformance records containing actual goal columns
      const snapshot: DistrictStatistics = {
        ...createMockSnapshot([clubA, clubB]),
        clubPerformance: [
          {
            'Club Number': 'A',
            'Club Name': 'Club A',
            Division: 'A',
            Area: '01',
            'Active Members': '20',
            'Goals Met': '2',
            'Club Status': 'Active',
            'Mem. Base': '20',
            // Goal columns: Club A achieved Goal 7 and Goal 10 only
            'Level 1s': '0',
            'Level 2s': '0',
            'Add. Level 2s': '0',
            'Level 3s': '0',
            'Level 4s, Path Completions, or DTM Awards': '0',
            'Add. Level 4s, Path Completions, or DTM award': '0',
            'New Members': '4', // Goal 7: achieved
            'Add. New Members': '0',
            'Off. Trained Round 1': '0',
            'Off. Trained Round 2': '0',
            'Mem. dues on time Oct': '1', // Goal 10a
            'Mem. dues on time Apr': '1', // Goal 10b
            'Off. List On Time': '1', // Goal 10c
          },
          {
            'Club Number': 'B',
            'Club Name': 'Club B',
            Division: 'A',
            Area: '01',
            'Active Members': '20',
            'Goals Met': '2',
            'Club Status': 'Active',
            'Mem. Base': '20',
            // Goal columns: Club B achieved Goal 1 and Goal 9 only
            'Level 1s': '4', // Goal 1: achieved
            'Level 2s': '0',
            'Add. Level 2s': '0',
            'Level 3s': '0',
            'Level 4s, Path Completions, or DTM Awards': '0',
            'Add. Level 4s, Path Completions, or DTM award': '0',
            'New Members': '0',
            'Add. New Members': '0',
            'Off. Trained Round 1': '4', // Goal 9a: achieved
            'Off. Trained Round 2': '4', // Goal 9b: achieved
            'Mem. dues on time Oct': '0',
            'Mem. dues on time Apr': '0',
            'Off. List On Time': '0',
          },
        ],
      }

      const analytics = module.generateDistinguishedClubAnalytics('D101', [
        snapshot,
      ])
      const allGoals = analytics.dcpGoalAnalysis.mostCommonlyAchieved

      // Find specific goals by goalNumber
      const goal1 = allGoals.find(g => g.goalNumber === 1)
      const goal7 = allGoals.find(g => g.goalNumber === 7)
      const goal9 = allGoals.find(g => g.goalNumber === 9)
      const goal10 = allGoals.find(g => g.goalNumber === 10)
      const goal2 = allGoals.find(g => g.goalNumber === 2)

      // Goal 1: only Club B achieved it → count = 1
      expect(goal1?.achievementCount).toBe(1)

      // Goal 7: only Club A achieved it → count = 1
      expect(goal7?.achievementCount).toBe(1)

      // Goal 9: only Club B achieved it → count = 1
      expect(goal9?.achievementCount).toBe(1)

      // Goal 10: only Club A achieved it → count = 1
      expect(goal10?.achievementCount).toBe(1)

      // Goal 2: neither club achieved it → count = 0
      expect(goal2?.achievementCount).toBe(0)
    })

    /**
     * #1118 (epic #1095 C1/C2): goal evaluation must use the REAL current
     * CSV headers and the official rule semantics:
     * - Goals 5/6 columns are 'Level 4s, Path Completions, or DTM Awards'
     *   (the legacy 'Level 4s, Level 5s, or DTM award' header no longer
     *   appears in live CSVs — reading it reports goals 5/6 as 0 forever).
     * - Goal 10 is officer list + (Oct dues OR Apr dues), not all three.
     * - Goals 1-8 use the official thresholds (4/2/2/2/1/1/4/4), not "> 0".
     */
    const REAL_HEADER_GOAL_COLUMNS = {
      'Level 1s': '0',
      'Level 2s': '0',
      'Add. Level 2s': '0',
      'Level 3s': '0',
      'Level 4s, Path Completions, or DTM Awards': '0',
      'Add. Level 4s, Path Completions, or DTM award': '0',
      'New Members': '0',
      'Add. New Members': '0',
      'Off. Trained Round 1': '0',
      'Off. Trained Round 2': '0',
      'Mem. dues on time Oct': '0',
      'Mem. dues on time Apr': '0',
      'Off. List On Time': '0',
    }

    function createRawClubRecord(
      clubId: string,
      goalOverrides: Record<string, string>
    ) {
      return {
        'Club Number': clubId,
        'Club Name': `Club ${clubId}`,
        Division: 'A',
        Area: '01',
        'Active Members': '20',
        'Goals Met': '0',
        'Club Status': 'Active',
        'Mem. Base': '20',
        ...REAL_HEADER_GOAL_COLUMNS,
        ...goalOverrides,
      }
    }

    function goalCountsFor(records: Record<string, string>[]) {
      const module = new DistinguishedClubAnalyticsModule()
      const clubs = records.map(r =>
        createMockClub(String(r['Club Number']), 0, 20)
      )
      const snapshot: DistrictStatistics = {
        ...createMockSnapshot(clubs),
        clubPerformance: records,
      }
      const analytics = module.generateDistinguishedClubAnalytics('D101', [
        snapshot,
      ])
      const allGoals = [
        ...analytics.dcpGoalAnalysis.mostCommonlyAchieved,
        ...analytics.dcpGoalAnalysis.leastCommonlyAchieved,
      ]
      return (goal: number) =>
        allGoals.find(g => g.goalNumber === goal)?.achievementCount
    }

    it('counts goals 5/6 from the real current CSV headers (#1118 C1)', () => {
      const count = goalCountsFor([
        createRawClubRecord('A', {
          'Level 4s, Path Completions, or DTM Awards': '1',
          'Add. Level 4s, Path Completions, or DTM award': '1',
        }),
      ])

      expect(count(5)).toBe(1)
      expect(count(6)).toBe(1)
    })

    it('counts goal 10 with Oct-only dues + officer list (#1118 C2)', () => {
      const count = goalCountsFor([
        createRawClubRecord('A', {
          'Mem. dues on time Oct': '1',
          'Off. List On Time': '1',
        }),
      ])

      expect(count(10)).toBe(1)
    })

    it('counts goal 10 with Apr-only dues + officer list (#1118 C2)', () => {
      const count = goalCountsFor([
        createRawClubRecord('A', {
          'Mem. dues on time Apr': '1',
          'Off. List On Time': '1',
        }),
      ])

      expect(count(10)).toBe(1)
    })

    it('does not count goal 10 when dues are on time but the officer list is not', () => {
      const count = goalCountsFor([
        createRawClubRecord('A', {
          'Mem. dues on time Oct': '1',
          'Mem. dues on time Apr': '1',
        }),
      ])

      expect(count(10)).toBe(0)
    })

    it('does not count goal 10 when the officer list is on time but no dues are', () => {
      const count = goalCountsFor([
        createRawClubRecord('A', {
          'Off. List On Time': '1',
        }),
      ])

      expect(count(10)).toBe(0)
    })

    it('applies the official DCP thresholds to goals 1-8, not "> 0" (#1118)', () => {
      const count = goalCountsFor([
        createRawClubRecord('A', {
          'Level 1s': '3', // goal 1 needs 4
          'Level 2s': '1', // goal 2 needs 2
          'New Members': '3', // goal 7 needs 4
        }),
        createRawClubRecord('B', {
          'Level 1s': '4',
          'Level 2s': '2',
          'New Members': '4',
        }),
      ])

      expect(count(1)).toBe(1)
      expect(count(2)).toBe(1)
      expect(count(7)).toBe(1)
    })

    it('should fall back to sequential approximation when raw CSV data is unavailable', () => {
      const module = new DistinguishedClubAnalyticsModule()

      // Snapshot without clubPerformance raw records (legacy data)
      const club = createMockClub('1', 3, 20)
      const snapshot = createMockSnapshot([club])
      // No clubPerformance on snapshot — should fall back to sequential assumption

      const analytics = module.generateDistinguishedClubAnalytics('D101', [
        snapshot,
      ])
      const allGoals = [
        ...analytics.dcpGoalAnalysis.mostCommonlyAchieved,
        ...analytics.dcpGoalAnalysis.leastCommonlyAchieved,
      ]

      // Should still produce 10 goals with the fallback sequential logic
      const uniqueGoals = new Set(allGoals.map(g => g.goalNumber))
      expect(uniqueGoals.size).toBe(10)
    })
  })
})
