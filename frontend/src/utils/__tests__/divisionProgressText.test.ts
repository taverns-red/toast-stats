/**
 * Division Progress Text Generation Unit Tests
 *
 * Unit tests for the generateDivisionProgressText function that creates
 * concise English paragraphs describing a division's progress toward
 * Distinguished Division recognition.
 *
 * Test scenarios cover:
 * - President's Distinguished achieved (no further gaps)
 * - Select Distinguished with incremental gap to President's
 * - Distinguished with incremental gaps to Select and President's
 * - Not distinguished with all gaps described incrementally
 * - Net club loss scenario with eligibility explanation
 * - Edge cases (0 clubs, 1 club)
 *
 * Correctness Properties tested:
 * - Property 3: Incremental Gap Description
 * - Property 4: Net Loss Blocker Display
 * - Property 5: Achievement Display
 * - Property 6: President's Distinguished No Further Gaps
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { describe, it, expect } from 'vitest'
import { generateDivisionProgressText } from '../divisionProgressText'
import { calculateDivisionGapAnalysis } from '../divisionGapAnalysis'
import {
  DivisionPerformance,
  DistinguishedStatus,
  MissingCspClub,
} from '../divisionStatus'

/**
 * Helper function to create a DivisionPerformance object for testing
 */
function createDivision(
  divisionId: string,
  clubBase: number,
  paidClubs: number,
  distinguishedClubs: number
): DivisionPerformance {
  // Determine status based on metrics (simplified for testing)
  let status: Exclude<DistinguishedStatus, 'not-qualified'> =
    'not-distinguished'
  if (paidClubs < clubBase) {
    status = 'not-distinguished'
  }

  return {
    divisionId,
    clubBase,
    paidClubs,
    distinguishedClubs,
    netGrowth: paidClubs - clubBase,
    requiredDistinguishedClubs: Math.ceil(clubBase * 0.5),
    status,
    areas: [],
    cspTracked: false,
    cspSubmittedCount: 0,
    clubsMissingCsp: [],
  }
}

describe('generateDivisionProgressText', () => {
  /**
   * Property 5: Achievement Display
   * Property 6: President's Distinguished No Further Gaps
   *
   * When a division has achieved President's Distinguished status,
   * the progress text should clearly state the achievement and
   * should NOT mention any further gaps or requirements.
   *
   * Validates: Requirements 6.5, 6.6
   */
  describe("President's Distinguished achieved", () => {
    it('should describe achievement without mentioning any further gaps', () => {
      // 50 clubs, 52 paid (base + 2), 28 distinguished (56% >= 55%)
      const division = createDivision('A', 50, 52, 28)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 52,
        distinguishedClubs: 28,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('presidents')
      expect(result.divisionLabel).toBe('Division A')
      expect(result.progressText).toContain("President's Distinguished")
      expect(result.progressText).toContain('status')
      // Property 6: Should NOT mention any gaps
      expect(result.progressText).not.toContain('For Select')
      expect(result.progressText).not.toContain('For Distinguished')
      expect(result.progressText).not.toContain('need')
    })

    it('should handle exactly at threshold values', () => {
      // 10 clubs, 12 paid (base + 2), 6 distinguished (60% >= 55%)
      const division = createDivision('B', 10, 12, 6)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 10,
        paidClubs: 12,
        distinguishedClubs: 6,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('presidents')
      expect(result.progressText).toContain("President's Distinguished status")
      expect(result.progressText).not.toContain('For')
    })
  })

  /**
   * Property 3: Incremental Gap Description
   * Property 5: Achievement Display
   *
   * When a division has achieved Select Distinguished status,
   * the progress text should clearly state the achievement and
   * describe only the incremental gap to President's Distinguished.
   *
   * Validates: Requirements 6.3, 6.4, 6.5
   */
  describe("Select Distinguished with incremental gap to President's", () => {
    it('should describe achievement and gap to Presidents (1 paid club needed)', () => {
      // 50 clubs, 51 paid (base + 1), 25 distinguished (50% = 50%)
      // Select achieved, but Presidents needs 1 more paid club and 3 more distinguished
      const division = createDivision('A', 50, 51, 25)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 51,
        distinguishedClubs: 25,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('select')
      expect(result.progressText).toContain('Select Distinguished status')
      expect(result.progressText).toContain('51 of 50 clubs paid')
      expect(result.progressText).toContain('25 of 50 distinguished')
      // Should mention gap to President's
      expect(result.progressText).toContain("President's Distinguished")
      // Should NOT mention gap to Distinguished (already achieved)
      expect(result.progressText).not.toContain('For Distinguished,')
    })

    it('should show only paid clubs needed when distinguished threshold already met', () => {
      // 10 clubs, 11 paid (base + 1), 6 distinguished (60% >= 55%)
      // Select achieved, Presidents needs 1 more paid club only
      const division = createDivision('B', 10, 11, 6)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 10,
        paidClubs: 11,
        distinguishedClubs: 6,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('select')
      expect(result.progressText).toContain('Select Distinguished status')
      expect(result.progressText).toContain("President's Distinguished")
      expect(result.progressText).toContain('1 more paid club')
    })
  })

  /**
   * Property 3: Incremental Gap Description
   * Property 5: Achievement Display
   *
   * When a division has achieved Distinguished status,
   * the progress text should clearly state the achievement and
   * describe incremental gaps to Select and President's Distinguished.
   *
   * Validates: Requirements 6.2, 6.3, 6.4, 6.5
   */
  describe("Distinguished with incremental gaps to Select and President's", () => {
    it('should describe achievement and incremental gaps', () => {
      // 50 clubs, 50 paid (base), 23 distinguished (46% >= 45%)
      // Distinguished achieved, Select needs 2 more distinguished + 1 paid, Presidents needs 5 more distinguished + 2 paid
      const division = createDivision('A', 50, 50, 23)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 50,
        distinguishedClubs: 23,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('distinguished')
      expect(result.progressText).toContain('Distinguished status')
      expect(result.progressText).toContain('50 of 50 clubs paid')
      expect(result.progressText).toContain('23 of 50 distinguished')
      // Should mention gap to Select
      expect(result.progressText).toContain('Select Distinguished')
      // Should mention gap to President's
      expect(result.progressText).toContain("President's Distinguished")
    })

    it('should build gaps incrementally (not repeat requirements)', () => {
      // 10 clubs, 10 paid (base), 5 distinguished (50% >= 45%)
      // Distinguished achieved
      // Select needs 0 more distinguished (already at 50%) + 1 paid
      // Presidents needs 1 more distinguished (55% = 6) + 2 paid (incremental: 1 more)
      const division = createDivision('B', 10, 10, 5)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 10,
        paidClubs: 10,
        distinguishedClubs: 5,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('distinguished')
      // The text should build incrementally
      expect(result.progressText).toContain('Select Distinguished')
      expect(result.progressText).toContain("President's Distinguished")
    })

    it('should handle case where only paid clubs are needed for higher levels', () => {
      // 10 clubs, 10 paid (base), 6 distinguished (60% >= 55%)
      // Distinguished achieved, Select needs 1 paid, Presidents needs 2 paid
      const division = createDivision('C', 10, 10, 6)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 10,
        paidClubs: 10,
        distinguishedClubs: 6,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('distinguished')
      expect(result.progressText).toContain('Select Distinguished')
      expect(result.progressText).toContain('paid club')
    })
  })

  /**
   * Property 3: Incremental Gap Description
   *
   * When a division is not yet distinguished but eligible (no net loss),
   * the progress text should describe all gaps incrementally.
   *
   * Validates: Requirements 5.2, 5.3, 6.2, 6.3, 6.4, 6.7
   */
  describe('Not distinguished with all gaps described incrementally', () => {
    it('should describe current status and all gaps', () => {
      // 50 clubs, 50 paid (no net loss), 20 distinguished (40% < 45%)
      const division = createDivision('A', 50, 50, 20)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 50,
        distinguishedClubs: 20,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('none')
      expect(result.progressText).toContain('not yet distinguished')
      expect(result.progressText).toContain('50 of 50 clubs paid')
      expect(result.progressText).toContain('20 of 50 distinguished')
      // Should mention all gaps
      expect(result.progressText).toContain('For Distinguished')
      expect(result.progressText).toContain('For Select Distinguished')
      expect(result.progressText).toContain("For President's Distinguished")
    })

    it('should describe gaps incrementally (not repeat requirements)', () => {
      // 10 clubs, 10 paid (no net loss), 0 distinguished
      // Distinguished needs 5 (45% of 10 = 4.5 -> 5)
      // Select needs 5 (50% of 10 = 5), so 0 additional beyond Distinguished, + 1 paid
      // Presidents needs 6 (55% of 10 = 5.5 -> 6), so 1 additional beyond Select, + 1 more paid
      const division = createDivision('B', 10, 10, 0)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 10,
        paidClubs: 10,
        distinguishedClubs: 0,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('none')
      expect(result.progressText).toContain('For Distinguished')
      expect(result.progressText).toContain('For Select Distinguished')
      expect(result.progressText).toContain("For President's Distinguished")
    })

    it('should handle case with many clubs needed', () => {
      // 100 clubs, 100 paid, 30 distinguished (30% < 45%)
      // Distinguished needs 45 (45% of 100), so 15 more
      // Select needs 50 (50% of 100), so 5 more beyond Distinguished, + 1 paid
      // Presidents needs 55 (55% of 100), so 5 more beyond Select, + 1 more paid
      const division = createDivision('C', 100, 100, 30)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 100,
        paidClubs: 100,
        distinguishedClubs: 30,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('none')
      expect(result.progressText).toContain('not yet distinguished')
      expect(result.progressText).toContain('For Distinguished')
    })
  })

  /**
   * Property 4: Net Loss Blocker Display
   *
   * When a division has net club loss (paidClubs < clubBase),
   * the progress text should clearly state the net club loss situation
   * and explain that paid clubs must be added before recognition is possible.
   *
   * Validates: Requirements 2.3, 6.1, 9.7
   */
  describe('Net club loss scenario with eligibility explanation', () => {
    it('should explain eligibility requirement first (already has enough distinguished)', () => {
      // 50 clubs, 48 paid (net club loss), 25 distinguished
      // Once eligibility is met, Distinguished requirements would be met (25 >= 45% of 50 = 23)
      const division = createDivision('A', 50, 48, 25)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 48,
        distinguishedClubs: 25,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('none')
      expect(result.progressText).toContain('net club loss')
      expect(result.progressText).toContain('48 of 50 clubs paid')
      // Should explain eligibility requirement
      expect(result.progressText).toContain('To become eligible')
      expect(result.progressText).toContain('2 paid clubs')
      // Since division already has 25 distinguished (>= 45% of 50 = 23), Distinguished would be met
      expect(result.progressText).toContain(
        'Distinguished requirements would be met'
      )
    })

    it('should handle significant net club loss', () => {
      // 100 clubs, 90 paid (need 10 more)
      const division = createDivision('B', 100, 90, 40)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 100,
        paidClubs: 90,
        distinguishedClubs: 40,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.progressText).toContain('net club loss')
      expect(result.progressText).toContain('90 of 100 clubs paid')
      expect(result.progressText).toContain('To become eligible')
      expect(result.progressText).toContain('10 paid clubs')
    })

    it('should describe Distinguished requirements after eligibility', () => {
      // 50 clubs, 45 paid (need 5 more), 10 distinguished
      // After eligibility, need 13 more distinguished for Distinguished (45% of 50 = 23)
      const division = createDivision('C', 50, 45, 10)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 45,
        distinguishedClubs: 10,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.progressText).toContain('To become eligible')
      expect(result.progressText).toContain('5 paid clubs')
      // After eligibility, need 13 distinguished for Distinguished (45% of 50 = 23)
      expect(result.progressText).toContain('Then for Distinguished')
      expect(result.progressText).toContain('to become distinguished')
    })

    it('should handle single paid club needed', () => {
      // 10 clubs, 9 paid (need 1 more)
      const division = createDivision('D', 10, 9, 3)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 10,
        paidClubs: 9,
        distinguishedClubs: 3,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.progressText).toContain('net club loss')
      expect(result.progressText).toContain('To become eligible')
      expect(result.progressText).toContain('1 paid club')
    })
  })

  /**
   * Edge cases: 0 clubs and 1 club scenarios
   *
   * Validates: Requirements 5.1, 5.2
   */
  describe('Edge cases', () => {
    describe('0 clubs (clubBase = 0)', () => {
      it('should handle division with 0 clubs gracefully', () => {
        const division = createDivision('A', 0, 0, 0)
        const gapAnalysis = calculateDivisionGapAnalysis({
          clubBase: 0,
          paidClubs: 0,
          distinguishedClubs: 0,
        })

        const result = generateDivisionProgressText(division, gapAnalysis)

        expect(result.currentLevel).toBe('none')
        expect(result.divisionLabel).toBe('Division A')
        // Should handle gracefully without errors
        expect(result.progressText).toBeDefined()
      })
    })

    describe('1 club (minimum case)', () => {
      it('should handle 1 club division at Distinguished level', () => {
        // 1 club, 1 paid (no net loss), 1 distinguished (100% >= 45%)
        const division = createDivision('A', 1, 1, 1)
        const gapAnalysis = calculateDivisionGapAnalysis({
          clubBase: 1,
          paidClubs: 1,
          distinguishedClubs: 1,
        })

        const result = generateDivisionProgressText(division, gapAnalysis)

        expect(result.currentLevel).toBe('distinguished')
        expect(result.progressText).toContain('Distinguished status')
        expect(result.progressText).toContain('1 of 1 clubs paid')
        expect(result.progressText).toContain('1 of 1 distinguished')
      })

      it('should handle 1 club division not distinguished', () => {
        // 1 club, 1 paid (no net loss), 0 distinguished
        const division = createDivision('B', 1, 1, 0)
        const gapAnalysis = calculateDivisionGapAnalysis({
          clubBase: 1,
          paidClubs: 1,
          distinguishedClubs: 0,
        })

        const result = generateDivisionProgressText(division, gapAnalysis)

        expect(result.currentLevel).toBe('none')
        expect(result.progressText).toContain('not yet distinguished')
        expect(result.progressText).toContain('1 of 1 clubs paid')
        expect(result.progressText).toContain('0 of 1 distinguished')
        // Should mention gap to Distinguished (need 1)
        expect(result.progressText).toContain('For Distinguished')
      })

      it('should handle 1 club division with net club loss', () => {
        // 1 club, 0 paid (net club loss)
        const division = createDivision('C', 1, 0, 0)
        const gapAnalysis = calculateDivisionGapAnalysis({
          clubBase: 1,
          paidClubs: 0,
          distinguishedClubs: 0,
        })

        const result = generateDivisionProgressText(division, gapAnalysis)

        expect(result.currentLevel).toBe('none')
        expect(result.progressText).toContain('net club loss')
        expect(result.progressText).toContain('0 of 1 clubs paid')
        expect(result.progressText).toContain('To become eligible')
        expect(result.progressText).toContain('1 paid club')
      })

      it("should handle 1 club division at President's level", () => {
        // 1 club, 3 paid (base + 2), 1 distinguished (100% >= 55%)
        const division = createDivision('D', 1, 3, 1)
        const gapAnalysis = calculateDivisionGapAnalysis({
          clubBase: 1,
          paidClubs: 3,
          distinguishedClubs: 1,
        })

        const result = generateDivisionProgressText(division, gapAnalysis)

        expect(result.currentLevel).toBe('presidents')
        expect(result.progressText).toContain("President's Distinguished")
      })
    })
  })

  /**
   * Division label generation tests
   */
  describe('Division label generation', () => {
    it('should format division label correctly', () => {
      const division = createDivision('A', 50, 50, 23)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 50,
        distinguishedClubs: 23,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.divisionLabel).toBe('Division A')
      expect(result.progressText).toContain('Division A')
    })

    it('should handle different division IDs', () => {
      const division = createDivision('X', 50, 50, 23)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 50,
        distinguishedClubs: 23,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.divisionLabel).toBe('Division X')
    })
  })

  /**
   * Return value structure tests
   */
  describe('Return value structure', () => {
    it('should return correct structure for DivisionProgressText', () => {
      const division = createDivision('A', 50, 50, 23)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 50,
        distinguishedClubs: 23,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result).toHaveProperty('divisionLabel')
      expect(result).toHaveProperty('currentLevel')
      expect(result).toHaveProperty('progressText')
      expect(typeof result.divisionLabel).toBe('string')
      expect(typeof result.currentLevel).toBe('string')
      expect(typeof result.progressText).toBe('string')
    })

    it('should return currentLevel matching gap analysis', () => {
      const division = createDivision('A', 50, 52, 28)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 52,
        distinguishedClubs: 28,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe(gapAnalysis.currentLevel)
    })
  })

  /**
   * Text formatting tests - ensure no double spaces or formatting issues
   */
  describe('Text formatting', () => {
    it('should not have double spaces in progress text', () => {
      const division = createDivision('A', 50, 50, 23)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 50,
        distinguishedClubs: 23,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.progressText).not.toMatch(/\s{2,}/)
    })

    it('should have proper sentence structure', () => {
      const division = createDivision('A', 50, 50, 23)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 50,
        distinguishedClubs: 23,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      // Should start with division label
      expect(result.progressText).toMatch(/^Division/)
      // Should end with a period
      expect(result.progressText).toMatch(/\.$/)
    })

    it('should not have double spaces in net loss text', () => {
      const division = createDivision('A', 50, 48, 25)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 50,
        paidClubs: 48,
        distinguishedClubs: 25,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.progressText).not.toMatch(/\s{2,}/)
    })
  })

  /**
   * Larger division scenarios (100+ clubs)
   */
  describe('Larger division scenarios', () => {
    it('should handle 100 club division at Distinguished', () => {
      // 100 clubs, 100 paid, 45 distinguished (45% = 45)
      const division = createDivision('A', 100, 100, 45)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 100,
        paidClubs: 100,
        distinguishedClubs: 45,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('distinguished')
      expect(result.progressText).toContain('100 of 100 clubs paid')
      expect(result.progressText).toContain('45 of 100 distinguished')
    })

    it('should handle 100 club division not distinguished', () => {
      // 100 clubs, 100 paid, 40 distinguished (40% < 45%)
      const division = createDivision('B', 100, 100, 40)
      const gapAnalysis = calculateDivisionGapAnalysis({
        clubBase: 100,
        paidClubs: 100,
        distinguishedClubs: 40,
      })

      const result = generateDivisionProgressText(division, gapAnalysis)

      expect(result.currentLevel).toBe('none')
      expect(result.progressText).toContain('not yet distinguished')
      // Need 5 more for Distinguished (45% of 100 = 45)
      expect(result.progressText).toContain('For Distinguished')
    })
  })
})

/**
 * Club Success Plan clause (#1555, spec §6.2) — count only; divisions are too
 * big to name clubs. Appended in every branch; nothing when not tracked.
 */
describe('generateDivisionProgressText — Club Success Plan clause (#1555)', () => {
  /** N active clubs without a plan, all existing clubs still inside the 30 September window. */
  function missingClubs(
    n: number,
    deadline: Pick<MissingCspClub, 'cspDueDate' | 'cspOverdue'> = {
      cspDueDate: '2026-09-30',
      cspOverdue: false,
    }
  ): MissingCspClub[] {
    return Array.from({ length: n }, (_, i) => ({
      clubNumber: String(i + 1),
      clubName: `Club ${i + 1}`,
      ...deadline,
    }))
  }

  function divisionWithCsp(
    clubBase: number,
    paidClubs: number,
    distinguishedClubs: number,
    csp: Partial<
      Pick<
        DivisionPerformance,
        'cspTracked' | 'cspSubmittedCount' | 'clubsMissingCsp'
      >
    >
  ): DivisionPerformance {
    return {
      ...createDivision('A', clubBase, paidClubs, distinguishedClubs),
      cspTracked: true,
      ...csp,
    }
  }

  function textFor(division: DivisionPerformance): string {
    const gapAnalysis = calculateDivisionGapAnalysis({
      clubBase: division.clubBase,
      paidClubs: division.paidClubs,
      distinguishedClubs: division.distinguishedClubs,
    })
    return generateDivisionProgressText(division, gapAnalysis).progressText
  }

  const OVERDUE = { cspDueDate: '2026-09-30', cspOverdue: true }
  const NEW_CHARTER = { cspDueDate: '2026-11-13', cspOverdue: false }

  it('before the deadline: the real D61 Division A shape, naming the date and the consequence', () => {
    const text = textFor(
      divisionWithCsp(18, 18, 0, {
        cspSubmittedCount: 5,
        clubsMissingCsp: missingClubs(13),
      })
    )
    expect(text).toContain('is not yet distinguished')
    expect(text).toContain(
      'Club Success Plans: 5 of 18 clubs have submitted; 13 have not and must file by 30 September 2026 — ' +
        'a club that misses that date cannot be Distinguished this program year.'
    )
    expect(text).not.toMatch(/until/)
  })

  it('after the deadline: terminal wording, no remediation implied', () => {
    const text = textFor(
      divisionWithCsp(18, 18, 0, {
        cspSubmittedCount: 5,
        clubsMissingCsp: missingClubs(13, OVERDUE),
      })
    )
    expect(text).toContain(
      'Club Success Plans: 5 of 18 clubs have submitted; 13 did not file by 30 September 2026 and cannot be Distinguished this program year.'
    )
    expect(text).not.toMatch(/until|must file/)
  })

  it('one missing, before and after: singular', () => {
    expect(
      textFor(
        divisionWithCsp(18, 18, 0, {
          cspSubmittedCount: 17,
          clubsMissingCsp: missingClubs(1),
        })
      )
    ).toContain(
      'Club Success Plans: 17 of 18 clubs have submitted; 1 has not and must file by 30 September 2026 — ' +
        'a club that misses that date cannot be Distinguished this program year.'
    )
    expect(
      textFor(
        divisionWithCsp(18, 18, 0, {
          cspSubmittedCount: 17,
          clubsMissingCsp: missingClubs(1, OVERDUE),
        })
      )
    ).toContain(
      'Club Success Plans: 17 of 18 clubs have submitted; 1 did not file by 30 September 2026 and cannot be Distinguished this program year.'
    )
  })

  it('one submitted: singular verb on the numerator', () => {
    const text = textFor(
      divisionWithCsp(18, 18, 0, {
        cspSubmittedCount: 1,
        clubsMissingCsp: missingClubs(17),
      })
    )
    expect(text).toContain(
      'Club Success Plans: 1 of 18 clubs has submitted; 17 have not and must file by 30 September 2026'
    )
  })

  it('several pending dates: names each date with its count', () => {
    const text = textFor(
      divisionWithCsp(18, 18, 0, {
        cspSubmittedCount: 5,
        clubsMissingCsp: [...missingClubs(12), ...missingClubs(1, NEW_CHARTER)],
      })
    )
    expect(text).toContain(
      'Club Success Plans: 5 of 18 clubs have submitted; 13 have not and must file by their due dates ' +
        '(30 September 2026 for 12 clubs and 13 November 2026 for 1 club) — ' +
        'a club that misses its date cannot be Distinguished this program year.'
    )
  })

  it('mixed: some past their date, a new charter still inside its window', () => {
    const text = textFor(
      divisionWithCsp(18, 18, 0, {
        cspSubmittedCount: 5,
        clubsMissingCsp: [
          ...missingClubs(12, OVERDUE),
          ...missingClubs(1, NEW_CHARTER),
        ],
      })
    )
    expect(text).toContain(
      'Club Success Plans: 5 of 18 clubs have submitted; 12 did not file by 30 September 2026 and cannot be ' +
        'Distinguished this program year; 1 is still due by 13 November 2026.'
    )
  })

  it('all overdue across several dates: "their due dates"', () => {
    const text = textFor(
      divisionWithCsp(18, 18, 0, {
        cspSubmittedCount: 5,
        clubsMissingCsp: [
          ...missingClubs(12, OVERDUE),
          ...missingClubs(1, { cspDueDate: '2026-09-29', cspOverdue: true }),
        ],
      })
    )
    expect(text).toContain(
      '13 did not file by their due dates and cannot be Distinguished this program year.'
    )
  })

  it('all submitted', () => {
    const text = textFor(
      divisionWithCsp(18, 18, 0, {
        cspSubmittedCount: 18,
        clubsMissingCsp: [],
      })
    )
    expect(text).toContain('Club Success Plans: all 18 clubs have submitted.')
  })

  it('renders nothing when not tracked, or when there are no tracked clubs', () => {
    expect(
      textFor(
        divisionWithCsp(18, 18, 0, {
          cspTracked: false,
          cspSubmittedCount: 0,
          clubsMissingCsp: missingClubs(13),
        })
      )
    ).not.toContain('Club Success Plan')
    expect(
      textFor(
        divisionWithCsp(0, 0, 0, {
          cspSubmittedCount: 0,
          clubsMissingCsp: [],
        })
      )
    ).not.toContain('Club Success Plan')
  })

  it('appears in the net-loss and achieved branches too, at the end', () => {
    const csp = { cspSubmittedCount: 5, clubsMissingCsp: missingClubs(13) }
    const clause =
      'Club Success Plans: 5 of 18 clubs have submitted; 13 have not and must file by 30 September 2026 — ' +
      'a club that misses that date cannot be Distinguished this program year.'

    const netLoss = textFor(divisionWithCsp(18, 17, 5, csp))
    expect(netLoss).toContain('has a net club loss')
    expect(netLoss.endsWith(clause)).toBe(true)

    // 18 base, 18 paid, 9 distinguished (50%) → Distinguished (45%); Select
    // needs base+1 paid, so this stays on the Distinguished rung.
    const achieved = textFor(divisionWithCsp(18, 18, 9, csp))
    expect(achieved).toContain('has achieved Distinguished status')
    expect(achieved.endsWith(clause)).toBe(true)
  })
})
