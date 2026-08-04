/**
 * ClubEligibilityUtils Tests
 *
 * TDD: Red phase — written before the implementation exists.
 * Tests the three shared club eligibility functions extracted from
 * ClubHealthAnalyticsModule, DistinguishedClubAnalyticsModule, and
 * AreaDivisionRecognitionModule.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateNetGrowth,
  classifyClubHealth,
  determineDistinguishedLevel,
  getCSPStatus,
  getConfirmedDistinguishedLevel,
  isClubSmedleyAvailable,
  isDistinguishedProvisional,
} from './ClubEligibilityUtils.js'
import type { ClubStatistics } from '../interfaces.js'

/**
 * Helper to create a minimal ClubStatistics object for testing.
 * Only the fields relevant to eligibility functions are required.
 */
function makeClub(overrides: Partial<ClubStatistics> = {}): ClubStatistics {
  return {
    clubId: '1234',
    clubName: 'Test Club',
    divisionId: 'A',
    areaId: '1',
    membershipCount: 20,
    paymentsCount: 10,
    dcpGoals: 5,
    status: 'Active',
    divisionName: 'Division A',
    areaName: 'Area 1',
    octoberRenewals: 5,
    aprilRenewals: 5,
    newMembers: 3,
    membershipBase: 18,
    ...overrides,
  }
}

// ============================================================
// calculateNetGrowth
// ============================================================

describe('calculateNetGrowth', () => {
  it('should return currentMembers - membershipBase for normal values', () => {
    const club = makeClub({ membershipCount: 25, membershipBase: 20 })
    expect(calculateNetGrowth(club)).toBe(5)
  })

  it('should return 0 when membership equals base', () => {
    const club = makeClub({ membershipCount: 20, membershipBase: 20 })
    expect(calculateNetGrowth(club)).toBe(0)
  })

  it('should return negative value when membership declined', () => {
    const club = makeClub({ membershipCount: 15, membershipBase: 20 })
    expect(calculateNetGrowth(club)).toBe(-5)
  })

  it('should treat membershipBase 0 as zero', () => {
    const club = makeClub({ membershipCount: 10, membershipBase: 0 })
    expect(calculateNetGrowth(club)).toBe(10)
  })
})

// ============================================================
// determineDistinguishedLevel
// ============================================================

describe('determineDistinguishedLevel', () => {
  // ---- Smedley Distinguished: 10 goals + 25 members ----

  it('should return Smedley for 10 goals and 25 members', () => {
    expect(determineDistinguishedLevel(10, 25, 0)).toBe('Smedley')
  })

  it('should return Smedley for exceeding thresholds', () => {
    expect(determineDistinguishedLevel(10, 30, 0)).toBe('Smedley')
  })

  // ---- President's Distinguished: 9 goals + 20 members ----
  // BUG FIX: Must return 'President' (not 'Presidents') to match DistinguishedLevel type

  it('should return President for 9 goals and 20 members', () => {
    expect(determineDistinguishedLevel(9, 20, 0)).toBe('President')
  })

  it('should return President for 9 goals and 24 members (not Smedley — needs 25)', () => {
    expect(determineDistinguishedLevel(9, 24, 0)).toBe('President')
  })

  it('should NOT return Presidents (with trailing s)', () => {
    // This test explicitly guards against the Bug 1 regression
    const result = determineDistinguishedLevel(9, 20, 0)
    expect(result).not.toBe('Presidents')
  })

  // ---- Select Distinguished: 7 goals + (20 members OR net growth >= 5) ----

  it('should return Select for 7 goals and 20 members', () => {
    expect(determineDistinguishedLevel(7, 20, 0)).toBe('Select')
  })

  it('should return Select for 7 goals and net growth 5 (membership below 20)', () => {
    expect(determineDistinguishedLevel(7, 15, 5)).toBe('Select')
  })

  it('should return Select for 8 goals and 20 members (below President threshold)', () => {
    expect(determineDistinguishedLevel(8, 20, 0)).toBe('Select')
  })

  // ---- Distinguished: 5 goals + (20 members OR net growth >= 3) ----

  it('should return Distinguished for 5 goals and 20 members', () => {
    expect(determineDistinguishedLevel(5, 20, 0)).toBe('Distinguished')
  })

  it('should return Distinguished for 5 goals and net growth 3 (membership below 20)', () => {
    expect(determineDistinguishedLevel(5, 15, 3)).toBe('Distinguished')
  })

  it('should return Distinguished for 6 goals and 20 members', () => {
    expect(determineDistinguishedLevel(6, 20, 0)).toBe('Distinguished')
  })

  // ---- NotDistinguished ----

  it('should return NotDistinguished for 4 goals (below 5 threshold)', () => {
    expect(determineDistinguishedLevel(4, 25, 10)).toBe('NotDistinguished')
  })

  it('should return NotDistinguished for 5 goals but insufficient membership and growth', () => {
    expect(determineDistinguishedLevel(5, 15, 2)).toBe('NotDistinguished')
  })

  it('should return NotDistinguished for 0 goals', () => {
    expect(determineDistinguishedLevel(0, 30, 10)).toBe('NotDistinguished')
  })

  // ---- Boundary value tests ----

  it('should return Distinguished at exact boundary (5 goals, 20 members)', () => {
    expect(determineDistinguishedLevel(5, 20, 0)).toBe('Distinguished')
  })

  it('should return Select at exact boundary (7 goals, net growth 5, low membership)', () => {
    expect(determineDistinguishedLevel(7, 10, 5)).toBe('Select')
  })

  it('should return Distinguished (not Select) when net growth is 4 (Select needs 5)', () => {
    // 7 goals + net growth 4: doesn't qualify for Select (needs 5),
    // but DOES qualify for Distinguished (needs 3)
    expect(determineDistinguishedLevel(7, 15, 4)).toBe('Distinguished')
  })

  it('should return NotDistinguished when Distinguished net growth is 2 (needs 3)', () => {
    expect(determineDistinguishedLevel(5, 15, 2)).toBe('NotDistinguished')
  })

  // ---- Highest applicable level wins ----

  it('should return Smedley over President when both qualify', () => {
    // 10 goals, 25 members qualifies for all levels; Smedley wins
    expect(determineDistinguishedLevel(10, 25, 10)).toBe('Smedley')
  })

  it('should return President over Select when both qualify', () => {
    // 9 goals, 20 members qualifies for President, Select, Distinguished
    expect(determineDistinguishedLevel(9, 20, 10)).toBe('President')
  })
})

// ============================================================
// Per-program-year club ruleset (#1406)
//
// The club Smedley rung was introduced for PY 2025-2026. Before that
// year the ladder topped out at President's Distinguished, so a club
// with 10 goals and 25+ members earned President's — not a tier that
// did not exist. Sibling of the district-side rulesetForProgramYear
// (#1116 item 5).
// ============================================================

describe('determineDistinguishedLevel — per program year (#1406)', () => {
  const smedleyQualifying = { goals: 10, members: 25, netGrowth: 10 }

  it.each([
    ['2019-2020'],
    ['2022-2023'],
    ['2024-2025'],
  ])(
    'awards President (not Smedley) in %s — the rung did not exist yet',
    programYear => {
      expect(
        determineDistinguishedLevel(
          smedleyQualifying.goals,
          smedleyQualifying.members,
          smedleyQualifying.netGrowth,
          programYear
        )
      ).toBe('President')
    }
  )

  it.each([['2025-2026'], ['2026-2027'], ['2030-2031']])(
    'awards Smedley in %s — the rung exists from 2025-26 onward',
    programYear => {
      expect(
        determineDistinguishedLevel(
          smedleyQualifying.goals,
          smedleyQualifying.members,
          smedleyQualifying.netGrowth,
          programYear
        )
      ).toBe('Smedley')
    }
  )

  it('leaves the lower rungs unchanged before 2025-26', () => {
    expect(determineDistinguishedLevel(9, 20, 0, '2024-2025')).toBe('President')
    expect(determineDistinguishedLevel(7, 15, 5, '2024-2025')).toBe('Select')
    expect(determineDistinguishedLevel(5, 15, 3, '2024-2025')).toBe(
      'Distinguished'
    )
    expect(determineDistinguishedLevel(4, 25, 10, '2024-2025')).toBe(
      'NotDistinguished'
    )
  })

  it('falls back to current rules when the program year is omitted', () => {
    expect(determineDistinguishedLevel(10, 25, 0)).toBe('Smedley')
  })

  it('falls back to current rules for an unparseable program year', () => {
    expect(determineDistinguishedLevel(10, 25, 0, 'not-a-year')).toBe('Smedley')
  })

  it('reports Smedley availability per program year', () => {
    expect(isClubSmedleyAvailable('2024-2025')).toBe(false)
    expect(isClubSmedleyAvailable('2025-2026')).toBe(true)
    expect(isClubSmedleyAvailable('2026-2027')).toBe(true)
    // Omitted / unparseable → current rules, matching the district side.
    expect(isClubSmedleyAvailable()).toBe(true)
    expect(isClubSmedleyAvailable('not-a-year')).toBe(true)
  })
})

describe('getConfirmedDistinguishedLevel — per program year (#1406)', () => {
  it('confirms President, not Smedley, before 2025-26', () => {
    expect(getConfirmedDistinguishedLevel(10, 25, 20, '2024-2025')).toBe(
      'President'
    )
  })

  it('confirms Smedley from 2025-26 onward', () => {
    expect(getConfirmedDistinguishedLevel(10, 25, 20, '2025-2026')).toBe(
      'Smedley'
    )
  })
})

// ============================================================
// getCSPStatus
// ============================================================

describe('getCSPStatus', () => {
  it('should return true when cspSubmitted is true', () => {
    const club = makeClub({ cspSubmitted: true })
    expect(getCSPStatus(club)).toBe(true)
  })

  it('should return false when cspSubmitted is false', () => {
    const club = makeClub({ cspSubmitted: false })
    expect(getCSPStatus(club)).toBe(false)
  })

  it('should return true when cspSubmitted is undefined (pre-2025 data)', () => {
    const club = makeClub() // no cspSubmitted field
    expect(getCSPStatus(club)).toBe(true)
  })

  it('should return true regardless of other club properties when CSP submitted', () => {
    const club = makeClub({
      membershipCount: 0,
      dcpGoals: 0,
      cspSubmitted: true,
    })
    expect(getCSPStatus(club)).toBe(true)
  })

  it('should return false regardless of strong performance when CSP not submitted', () => {
    const club = makeClub({
      membershipCount: 30,
      dcpGoals: 10,
      cspSubmitted: false,
    })
    expect(getCSPStatus(club)).toBe(false)
  })
})

describe('isDistinguishedProvisional', () => {
  it('returns true for pre-April Distinguished club with 0 april renewals', () => {
    expect(isDistinguishedProvisional('Distinguished', 0, 15, 3)).toBe(true)
  })

  it('returns false for pre-April club with enough april renewals (>= 20)', () => {
    expect(isDistinguishedProvisional('Distinguished', 20, 15, 3)).toBe(false)
  })

  it('returns false for pre-April club qualifying on net growth via april renewals', () => {
    // membershipBase=15, aprilRenewals=18 → net growth = 3
    expect(isDistinguishedProvisional('Distinguished', 18, 15, 3)).toBe(false)
  })

  it('returns true for pre-April club qualifying on memberCount but not aprilRenewals', () => {
    // Club has 22 members (qualifies) but only 10 april renewals (not enough)
    // net growth from renewals: 10 - 15 = -5 (not enough)
    expect(isDistinguishedProvisional('Select', 10, 15, 2)).toBe(true)
  })

  it('returns false for post-April data (dataMonth >= 4)', () => {
    // Even with 0 april renewals, post-April data is confirmed
    expect(isDistinguishedProvisional('Distinguished', 0, 15, 4)).toBe(false)
  })

  it('returns false for post-April data in later months', () => {
    expect(isDistinguishedProvisional('Distinguished', 0, 15, 6)).toBe(false)
  })

  it('returns false for NotDistinguished clubs regardless of data month', () => {
    expect(isDistinguishedProvisional('NotDistinguished', 0, 15, 2)).toBe(false)
  })

  it('returns true for Smedley-level club pre-April without confirmed members', () => {
    expect(isDistinguishedProvisional('Smedley', 5, 15, 1)).toBe(true)
  })

  it('returns false for pre-April club where april renewals exactly meet threshold', () => {
    // membershipBase=17, aprilRenewals=20 → meets 20 threshold
    expect(isDistinguishedProvisional('Distinguished', 20, 17, 3)).toBe(false)
  })

  it('handles July (dataMonth=7) as pre-April in program year context', () => {
    // July is the start of the program year — definitely pre-April
    expect(isDistinguishedProvisional('Distinguished', 0, 15, 7)).toBe(true)
  })

  // ---- Level-specific thresholds (#296) ----

  it('returns true for Smedley with 23 renewals (needs 25, no growth alternative)', () => {
    // Smedley requires 25 members — no net growth shortcut
    expect(isDistinguishedProvisional('Smedley', 23, 15, 2)).toBe(true)
  })

  it('returns false for Smedley with 25 renewals', () => {
    expect(isDistinguishedProvisional('Smedley', 25, 15, 2)).toBe(false)
  })

  it('returns true for President with 19 renewals even with high net growth', () => {
    // President requires 20 members — no net growth alternative
    // renewals=19, base=10, netGrowth=9 — growth doesn't help President
    expect(isDistinguishedProvisional('President', 19, 10, 2)).toBe(true)
  })

  it('returns false for President with 20 renewals', () => {
    expect(isDistinguishedProvisional('President', 20, 15, 2)).toBe(false)
  })

  it('returns false for Select with 18 renewals but net growth >= 5', () => {
    // Select allows net growth alternative >= 5
    // renewals=18, base=10 → confirmedNetGrowth=8 >= 5
    expect(isDistinguishedProvisional('Select', 18, 10, 2)).toBe(false)
  })

  it('returns true for Select with 18 renewals and net growth 4 (needs 5)', () => {
    // renewals=18, base=14 → confirmedNetGrowth=4 < 5, and 18 < 20
    expect(isDistinguishedProvisional('Select', 18, 14, 2)).toBe(true)
  })
})

// ============================================================
// getConfirmedDistinguishedLevel (#296)
// ============================================================

describe('getConfirmedDistinguishedLevel', () => {
  it('returns Distinguished when renewals qualify for Distinguished but not higher', () => {
    // 9 goals, 19 renewals, base=15 → netGrowth=4 → Distinguished (>=3) but not Select (needs 5)
    expect(getConfirmedDistinguishedLevel(9, 19, 15)).toBe('Distinguished')
  })

  it('returns Smedley when renewals meet Smedley threshold', () => {
    // 10 goals, 25 renewals, base=20 → Smedley (10 goals + 25 members)
    expect(getConfirmedDistinguishedLevel(10, 25, 20)).toBe('Smedley')
  })

  it('returns President when renewals meet President but not Smedley', () => {
    // 10 goals, 23 renewals, base=20 → 23 >= 20 (President) but < 25 (Smedley)
    expect(getConfirmedDistinguishedLevel(10, 23, 20)).toBe('President')
  })

  it('returns Select when renewals qualify via net growth >= 5', () => {
    // 7 goals, 18 renewals, base=10 → netGrowth=8 >= 5 → Select
    expect(getConfirmedDistinguishedLevel(7, 18, 10)).toBe('Select')
  })

  it('returns NotDistinguished when renewals are too low', () => {
    // 5 goals, 15 renewals, base=14 → netGrowth=1 < 3, 15 < 20
    expect(getConfirmedDistinguishedLevel(5, 15, 14)).toBe('NotDistinguished')
  })

  it('returns NotDistinguished when goals are insufficient', () => {
    // 4 goals, 25 renewals, base=15 → not enough goals for any level
    expect(getConfirmedDistinguishedLevel(4, 25, 15)).toBe('NotDistinguished')
  })
})

// ============================================================
// classifyClubHealth (#1120 — single source for §5 classification)
// ============================================================

describe('classifyClubHealth', () => {
  it('classifies a 3-goal club in June as vulnerable (checkpoint is 5)', () => {
    // The C3 audit disagreement fixture: dcpGoals > 0 said "thriving",
    // the §5.3 monthly checkpoint says June requires 5 goals.
    const result = classifyClubHealth(
      { membership: 25, netGrowth: 5, dcpGoals: 3, cspSubmitted: true },
      6
    )
    expect(result.status).toBe('vulnerable')
    expect(result.requiredDcpCheckpoint).toBe(5)
    expect(result.membershipRequirementMet).toBe(true)
    expect(result.dcpCheckpointMet).toBe(false)
    expect(result.cspRequirementMet).toBe(true)
  })

  it('classifies the same 3-goal club in July as thriving (checkpoint is 0)', () => {
    const result = classifyClubHealth(
      { membership: 25, netGrowth: 5, dcpGoals: 3, cspSubmitted: true },
      7
    )
    expect(result.status).toBe('thriving')
    expect(result.requiredDcpCheckpoint).toBe(0)
  })

  it('classifies a 5-goal club in June as thriving', () => {
    const result = classifyClubHealth(
      { membership: 25, netGrowth: 5, dcpGoals: 5, cspSubmitted: true },
      6
    )
    expect(result.status).toBe('thriving')
  })

  it('applies the intervention override regardless of goals and CSP', () => {
    // membership < 12 AND net growth < 3 → intervention-required
    const result = classifyClubHealth(
      { membership: 8, netGrowth: -2, dcpGoals: 9, cspSubmitted: true },
      6
    )
    expect(result.status).toBe('intervention-required')
  })

  it('escapes the intervention override via net growth >= 3', () => {
    // membership 11 < 12 but netGrowth 6 >= 3 → not intervention;
    // membership requirement met via growth, June checkpoint 5 met
    const result = classifyClubHealth(
      { membership: 11, netGrowth: 6, dcpGoals: 5, cspSubmitted: true },
      6
    )
    expect(result.status).toBe('thriving')
  })

  it('classifies a CSP-less club as vulnerable even when all else is met', () => {
    const result = classifyClubHealth(
      { membership: 25, netGrowth: 5, dcpGoals: 9, cspSubmitted: false },
      6
    )
    expect(result.status).toBe('vulnerable')
    expect(result.cspRequirementMet).toBe(false)
    expect(result.membershipRequirementMet).toBe(true)
    expect(result.dcpCheckpointMet).toBe(true)
  })

  it('fails the membership requirement below 20 members with growth < 3', () => {
    // membership 15 (>= 12, no intervention), growth 2 → requirement not met
    const result = classifyClubHealth(
      { membership: 15, netGrowth: 2, dcpGoals: 9, cspSubmitted: true },
      6
    )
    expect(result.status).toBe('vulnerable')
    expect(result.membershipRequirementMet).toBe(false)
  })
})
