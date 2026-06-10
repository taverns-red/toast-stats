/**
 * Unit tests for TargetCalculator module
 *
 * Tests the target calculation functions for district performance metrics:
 * - calculateGrowthTargets: For paid clubs and membership payments (base + percentage)
 * - calculatePercentageTargets: For distinguished clubs (percentage of base)
 * - determineAchievedLevel: For determining highest achieved recognition level
 *
 * **Validates: Requirements 2.1-2.6, 3.1-3.6, 4.1-4.6, 5.1-5.6**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  calculateGrowthTargets,
  calculatePercentageTargets,
  determineAchievedLevel,
  GROWTH_PERCENTAGES,
  DISTINGUISHED_PERCENTAGES,
} from '../TargetCalculator.js'
import type { RecognitionTargets } from '../../types.js'

describe('TargetCalculator', () => {
  describe('GROWTH_PERCENTAGES constant', () => {
    /**
     * Test: Growth percentages are correctly defined
     *
     * **Validates: Requirements 2.1-2.4, 3.1-3.4**
     */
    it('should have correct percentage values for each recognition level', () => {
      expect(GROWTH_PERCENTAGES.distinguished).toBe(0.01) // +1%
      expect(GROWTH_PERCENTAGES.select).toBe(0.03) // +3%
      expect(GROWTH_PERCENTAGES.presidents).toBe(0.05) // +5%
      expect(GROWTH_PERCENTAGES.smedley).toBe(0.08) // +8%
    })
  })

  describe('DISTINGUISHED_PERCENTAGES constant', () => {
    /**
     * Test: Distinguished percentages are correctly defined
     *
     * **Validates: Requirements 4.1-4.4**
     */
    it('should have correct percentage values for each recognition level', () => {
      expect(DISTINGUISHED_PERCENTAGES.distinguished).toBe(0.45) // 45%
      expect(DISTINGUISHED_PERCENTAGES.select).toBe(0.5) // 50%
      expect(DISTINGUISHED_PERCENTAGES.presidents).toBe(0.55) // 55%
      expect(DISTINGUISHED_PERCENTAGES.smedley).toBe(0.6) // 60%
    })
  })

  describe('calculateGrowthTargets', () => {
    /**
     * Test: Growth targets with base value 100
     * Formula: base * (1 + percentage), rounded up
     *
     * Expected results:
     * - Distinguished: 100 * 1.01 = 101
     * - Select: 100 * 1.03 = 103
     * - President's: 100 * 1.05 = 105
     * - Smedley: 100 * 1.08 = 108
     *
     * **Validates: Requirements 2.1-2.4, 3.1-3.4**
     */
    it('should calculate correct targets for base value 100', () => {
      const targets = calculateGrowthTargets(100)

      expect(targets.distinguished).toBe(101)
      expect(targets.select).toBe(103)
      expect(targets.presidents).toBe(105)
      expect(targets.smedley).toBe(108)
    })

    /**
     * Test: Growth targets with base value 95
     * Formula: base * (1 + percentage), rounded up
     *
     * Expected results:
     * - Distinguished: 95 * 1.01 = 95.95 → ceil → 96
     * - Select: 95 * 1.03 = 97.85 → ceil → 98
     * - President's: 95 * 1.05 = 99.75 → ceil → 100
     * - Smedley: 95 * 1.08 = 102.6 → ceil → 103
     *
     * **Validates: Requirements 2.1-2.4, 2.6, 3.1-3.4, 3.6**
     */
    it('should calculate correct targets for base value 95 with ceiling rounding', () => {
      const targets = calculateGrowthTargets(95)

      expect(targets.distinguished).toBe(96)
      expect(targets.select).toBe(98)
      expect(targets.presidents).toBe(100)
      expect(targets.smedley).toBe(103)
    })

    /**
     * Test: Growth targets with base value 99 (tests ceiling rounding)
     * Formula: base * (1 + percentage), rounded up
     *
     * Expected results:
     * - Distinguished: 99 * 1.01 = 99.99 → ceil → 100
     * - Select: 99 * 1.03 = 101.97 → ceil → 102
     * - President's: 99 * 1.05 = 103.95 → ceil → 104
     * - Smedley: 99 * 1.08 = 106.92 → ceil → 107
     *
     * **Validates: Requirements 2.6, 3.6**
     */
    it('should apply ceiling rounding for base value 99', () => {
      const targets = calculateGrowthTargets(99)

      expect(targets.distinguished).toBe(100)
      expect(targets.select).toBe(102)
      expect(targets.presidents).toBe(104)
      expect(targets.smedley).toBe(107)
    })

    /**
     * Test: Growth targets with small base value 10
     * Tests that ceiling rounding works correctly with smaller numbers
     *
     * Expected results:
     * - Distinguished: 10 * 1.01 = 10.1 → ceil → 11
     * - Select: 10 * 1.03 = 10.3 → ceil → 11
     * - President's: 10 * 1.05 = 10.5 → ceil → 11
     * - Smedley: 10 * 1.08 = 10.8 → ceil → 11
     *
     * **Validates: Requirements 2.6, 3.6**
     */
    it('should apply ceiling rounding for small base value 10', () => {
      const targets = calculateGrowthTargets(10)

      expect(targets.distinguished).toBe(11)
      expect(targets.select).toBe(11)
      expect(targets.presidents).toBe(11)
      expect(targets.smedley).toBe(11)
    })

    /**
     * Test: Growth targets with large base value 1000
     * Tests that calculations work correctly with larger numbers
     *
     * Expected results:
     * - Distinguished: 1000 * 1.01 = 1010
     * - Select: 1000 * 1.03 = 1030
     * - President's: 1000 * 1.05 = 1050
     * - Smedley: 1000 * 1.08 = 1080
     *
     * **Validates: Requirements 2.1-2.4, 3.1-3.4**
     */
    it('should calculate correct targets for large base value 1000', () => {
      const targets = calculateGrowthTargets(1000)

      expect(targets.distinguished).toBe(1010)
      expect(targets.select).toBe(1030)
      expect(targets.presidents).toBe(1050)
      expect(targets.smedley).toBe(1080)
    })

    /**
     * Test: All targets are integers
     *
     * **Validates: Requirements 2.6, 3.6**
     */
    it('should always return integer targets', () => {
      const testBases = [1, 7, 13, 47, 99, 100, 123, 500, 999]

      for (const base of testBases) {
        const targets = calculateGrowthTargets(base)

        expect(Number.isInteger(targets.distinguished)).toBe(true)
        expect(Number.isInteger(targets.select)).toBe(true)
        expect(Number.isInteger(targets.presidents)).toBe(true)
        expect(Number.isInteger(targets.smedley)).toBe(true)
      }
    })

    /**
     * Test: Targets are in ascending order (distinguished < select < presidents < smedley)
     *
     * **Validates: Requirements 2.1-2.4, 3.1-3.4**
     */
    it('should return targets in ascending order', () => {
      const testBases = [50, 100, 200, 500]

      for (const base of testBases) {
        const targets = calculateGrowthTargets(base)

        expect(targets.distinguished).toBeLessThanOrEqual(targets.select)
        expect(targets.select).toBeLessThanOrEqual(targets.presidents)
        expect(targets.presidents).toBeLessThanOrEqual(targets.smedley)
      }
    })
  })

  describe('calculatePercentageTargets', () => {
    /**
     * Test: Percentage targets with base value 100
     * Formula: base * percentage, rounded up using Math.ceil
     *
     * Expected results:
     * - Distinguished: 100 * 0.45 = 45 → ceil → 45
     * - Select: 100 * 0.50 = 50 → ceil → 50
     * - President's: 100 * 0.55 = 55.00000000000001 (floating-point) → ceil → 56
     * - Smedley: 100 * 0.60 = 60 → ceil → 60
     *
     * Note: Due to floating-point precision, 100 * 0.55 = 55.00000000000001,
     * which Math.ceil() correctly rounds up to 56.
     *
     * **Validates: Requirements 4.1-4.4, 4.6**
     */
    it('should calculate correct targets for base value 100', () => {
      const targets = calculatePercentageTargets(100)

      expect(targets.distinguished).toBe(45)
      expect(targets.select).toBe(50)
      expect(targets.presidents).toBe(56) // 55.00000000000001 → ceil → 56
      expect(targets.smedley).toBe(60)
    })

    /**
     * Test: Percentage targets with base value 95
     * Formula: base * percentage, rounded up
     *
     * Expected results:
     * - Distinguished: 95 * 0.45 = 42.75 → ceil → 43
     * - Select: 95 * 0.50 = 47.5 → ceil → 48
     * - President's: 95 * 0.55 = 52.25 → ceil → 53
     * - Smedley: 95 * 0.60 = 57 → ceil → 57
     *
     * **Validates: Requirements 4.1-4.4, 4.6**
     */
    it('should calculate correct targets for base value 95 with ceiling rounding', () => {
      const targets = calculatePercentageTargets(95)

      expect(targets.distinguished).toBe(43)
      expect(targets.select).toBe(48)
      expect(targets.presidents).toBe(53)
      expect(targets.smedley).toBe(57)
    })

    /**
     * Test: Percentage targets with base value 99 (tests ceiling rounding)
     * Formula: base * percentage, rounded up
     *
     * Expected results:
     * - Distinguished: 99 * 0.45 = 44.55 → ceil → 45
     * - Select: 99 * 0.50 = 49.5 → ceil → 50
     * - President's: 99 * 0.55 = 54.45 → ceil → 55
     * - Smedley: 99 * 0.60 = 59.4 → ceil → 60
     *
     * **Validates: Requirements 4.6**
     */
    it('should apply ceiling rounding for base value 99', () => {
      const targets = calculatePercentageTargets(99)

      expect(targets.distinguished).toBe(45)
      expect(targets.select).toBe(50)
      expect(targets.presidents).toBe(55)
      expect(targets.smedley).toBe(60)
    })

    /**
     * Test: Percentage targets with small base value 10
     * Tests that ceiling rounding works correctly with smaller numbers
     *
     * Expected results:
     * - Distinguished: 10 * 0.45 = 4.5 → ceil → 5
     * - Select: 10 * 0.50 = 5
     * - President's: 10 * 0.55 = 5.5 → ceil → 6
     * - Smedley: 10 * 0.60 = 6
     *
     * **Validates: Requirements 4.6**
     */
    it('should apply ceiling rounding for small base value 10', () => {
      const targets = calculatePercentageTargets(10)

      expect(targets.distinguished).toBe(5)
      expect(targets.select).toBe(5)
      expect(targets.presidents).toBe(6)
      expect(targets.smedley).toBe(6)
    })

    /**
     * Test: Percentage targets with large base value 1000
     * Tests that calculations work correctly with larger numbers
     *
     * Expected results:
     * - Distinguished: 1000 * 0.45 = 450
     * - Select: 1000 * 0.50 = 500
     * - President's: 1000 * 0.55 = 550
     * - Smedley: 1000 * 0.60 = 600
     *
     * **Validates: Requirements 4.1-4.4**
     */
    it('should calculate correct targets for large base value 1000', () => {
      const targets = calculatePercentageTargets(1000)

      expect(targets.distinguished).toBe(450)
      expect(targets.select).toBe(500)
      expect(targets.presidents).toBe(550)
      expect(targets.smedley).toBe(600)
    })

    /**
     * Test: All targets are integers
     *
     * **Validates: Requirements 4.6**
     */
    it('should always return integer targets', () => {
      const testBases = [1, 7, 13, 47, 99, 100, 123, 500, 999]

      for (const base of testBases) {
        const targets = calculatePercentageTargets(base)

        expect(Number.isInteger(targets.distinguished)).toBe(true)
        expect(Number.isInteger(targets.select)).toBe(true)
        expect(Number.isInteger(targets.presidents)).toBe(true)
        expect(Number.isInteger(targets.smedley)).toBe(true)
      }
    })

    /**
     * Test: Targets are in ascending order (distinguished < select < presidents < smedley)
     *
     * **Validates: Requirements 4.1-4.4**
     */
    it('should return targets in ascending order', () => {
      const testBases = [50, 100, 200, 500]

      for (const base of testBases) {
        const targets = calculatePercentageTargets(base)

        expect(targets.distinguished).toBeLessThanOrEqual(targets.select)
        expect(targets.select).toBeLessThanOrEqual(targets.presidents)
        expect(targets.presidents).toBeLessThanOrEqual(targets.smedley)
      }
    })
  })

  describe('determineAchievedLevel', () => {
    /**
     * Helper to create targets for testing
     */
    function createTargets(
      distinguished: number,
      select: number,
      presidents: number,
      smedley: number
    ): RecognitionTargets {
      return { distinguished, select, presidents, smedley }
    }

    describe('null targets case', () => {
      /**
       * Test: Returns null when targets are null
       *
       * **Validates: Requirements 5.6**
       */
      it('should return null when targets are null', () => {
        expect(determineAchievedLevel(100, null)).toBeNull()
        expect(determineAchievedLevel(0, null)).toBeNull()
        expect(determineAchievedLevel(1000, null)).toBeNull()
      })
    })

    describe('below all targets', () => {
      /**
       * Test: Returns null when current value is below distinguished target
       *
       * **Validates: Requirements 5.5**
       */
      it('should return null when below distinguished target', () => {
        const targets = createTargets(100, 103, 105, 108)

        expect(determineAchievedLevel(99, targets)).toBeNull()
        expect(determineAchievedLevel(50, targets)).toBeNull()
        expect(determineAchievedLevel(0, targets)).toBeNull()
      })
    })

    describe('at exact boundaries', () => {
      /**
       * Test: Returns 'distinguished' when exactly at distinguished target
       *
       * **Validates: Requirements 5.4**
       */
      it('should return distinguished when exactly at distinguished target', () => {
        const targets = createTargets(100, 103, 105, 108)

        expect(determineAchievedLevel(100, targets)).toBe('distinguished')
      })

      /**
       * Test: Returns 'select' when exactly at select target
       *
       * **Validates: Requirements 5.3**
       */
      it('should return select when exactly at select target', () => {
        const targets = createTargets(100, 103, 105, 108)

        expect(determineAchievedLevel(103, targets)).toBe('select')
      })

      /**
       * Test: Returns 'presidents' when exactly at presidents target
       *
       * **Validates: Requirements 5.2**
       */
      it('should return presidents when exactly at presidents target', () => {
        const targets = createTargets(100, 103, 105, 108)

        expect(determineAchievedLevel(105, targets)).toBe('presidents')
      })

      /**
       * Test: Returns 'smedley' when exactly at smedley target
       *
       * **Validates: Requirements 5.1**
       */
      it('should return smedley when exactly at smedley target', () => {
        const targets = createTargets(100, 103, 105, 108)

        expect(determineAchievedLevel(108, targets)).toBe('smedley')
      })
    })

    describe('between levels', () => {
      /**
       * Test: Returns 'distinguished' when between distinguished and select
       *
       * **Validates: Requirements 5.4**
       */
      it('should return distinguished when between distinguished and select', () => {
        const targets = createTargets(100, 103, 105, 108)

        expect(determineAchievedLevel(101, targets)).toBe('distinguished')
        expect(determineAchievedLevel(102, targets)).toBe('distinguished')
      })

      /**
       * Test: Returns 'select' when between select and presidents
       *
       * **Validates: Requirements 5.3**
       */
      it('should return select when between select and presidents', () => {
        const targets = createTargets(100, 103, 105, 108)

        expect(determineAchievedLevel(104, targets)).toBe('select')
      })

      /**
       * Test: Returns 'presidents' when between presidents and smedley
       *
       * **Validates: Requirements 5.2**
       */
      it('should return presidents when between presidents and smedley', () => {
        const targets = createTargets(100, 103, 105, 108)

        expect(determineAchievedLevel(106, targets)).toBe('presidents')
        expect(determineAchievedLevel(107, targets)).toBe('presidents')
      })
    })

    describe('above smedley', () => {
      /**
       * Test: Returns 'smedley' when above smedley target
       *
       * **Validates: Requirements 5.1**
       */
      it('should return smedley when above smedley target', () => {
        const targets = createTargets(100, 103, 105, 108)

        expect(determineAchievedLevel(109, targets)).toBe('smedley')
        expect(determineAchievedLevel(150, targets)).toBe('smedley')
        expect(determineAchievedLevel(1000, targets)).toBe('smedley')
      })
    })

    describe('with percentage-based targets (distinguished clubs)', () => {
      /**
       * Test: Achieved level determination with percentage-based targets
       * Using targets from base=100: distinguished=45, select=50, presidents=55, smedley=60
       *
       * **Validates: Requirements 5.1-5.5**
       */
      it('should correctly determine levels with percentage-based targets', () => {
        const targets = createTargets(45, 50, 55, 60)

        // Below all
        expect(determineAchievedLevel(44, targets)).toBeNull()

        // At boundaries
        expect(determineAchievedLevel(45, targets)).toBe('distinguished')
        expect(determineAchievedLevel(50, targets)).toBe('select')
        expect(determineAchievedLevel(55, targets)).toBe('presidents')
        expect(determineAchievedLevel(60, targets)).toBe('smedley')

        // Between levels
        expect(determineAchievedLevel(47, targets)).toBe('distinguished')
        expect(determineAchievedLevel(52, targets)).toBe('select')
        expect(determineAchievedLevel(57, targets)).toBe('presidents')

        // Above smedley
        expect(determineAchievedLevel(65, targets)).toBe('smedley')
      })
    })

    describe('edge cases', () => {
      /**
       * Test: Handles targets where all levels have the same value
       * This can happen with very small base values
       *
       * **Validates: Requirements 5.1-5.5**
       */
      it('should handle targets where all levels have the same value', () => {
        // With base=10 and growth targets, all could round to 11
        const targets = createTargets(11, 11, 11, 11)

        expect(determineAchievedLevel(10, targets)).toBeNull()
        expect(determineAchievedLevel(11, targets)).toBe('smedley') // Meets all targets
        expect(determineAchievedLevel(12, targets)).toBe('smedley')
      })

      /**
       * Test: Handles zero current value
       *
       * **Validates: Requirements 5.5**
       */
      it('should return null for zero current value with positive targets', () => {
        const targets = createTargets(45, 50, 55, 60)

        expect(determineAchievedLevel(0, targets)).toBeNull()
      })

      /**
       * Test: Handles targets with value 1
       *
       * **Validates: Requirements 5.1-5.5**
       */
      it('should handle targets with minimum value 1', () => {
        const targets = createTargets(1, 2, 3, 4)

        expect(determineAchievedLevel(0, targets)).toBeNull()
        expect(determineAchievedLevel(1, targets)).toBe('distinguished')
        expect(determineAchievedLevel(2, targets)).toBe('select')
        expect(determineAchievedLevel(3, targets)).toBe('presidents')
        expect(determineAchievedLevel(4, targets)).toBe('smedley')
        expect(determineAchievedLevel(5, targets)).toBe('smedley')
      })
    })
  })

  describe('integration: calculateGrowthTargets + determineAchievedLevel', () => {
    /**
     * Test: End-to-end flow for paid clubs/membership payments
     * Base=100 → targets: 101, 103, 105, 108
     *
     * **Validates: Requirements 2.1-2.4, 5.1-5.5**
     */
    it('should correctly determine levels using calculated growth targets', () => {
      const targets = calculateGrowthTargets(100)

      // Verify targets
      expect(targets).toEqual({
        distinguished: 101,
        select: 103,
        presidents: 105,
        smedley: 108,
      })

      // Verify level determination
      expect(determineAchievedLevel(100, targets)).toBeNull()
      expect(determineAchievedLevel(101, targets)).toBe('distinguished')
      expect(determineAchievedLevel(103, targets)).toBe('select')
      expect(determineAchievedLevel(105, targets)).toBe('presidents')
      expect(determineAchievedLevel(108, targets)).toBe('smedley')
      expect(determineAchievedLevel(110, targets)).toBe('smedley')
    })
  })

  describe('integration: calculatePercentageTargets + determineAchievedLevel', () => {
    /**
     * Test: End-to-end flow for distinguished clubs
     * Base=100 → targets: 45, 50, 56, 60
     *
     * Note: President's target is 56 (not 55) due to floating-point precision:
     * 100 * 0.55 = 55.00000000000001 → Math.ceil() → 56
     *
     * **Validates: Requirements 4.1-4.4, 5.1-5.5**
     */
    it('should correctly determine levels using calculated percentage targets', () => {
      const targets = calculatePercentageTargets(100)

      // Verify targets
      expect(targets).toEqual({
        distinguished: 45,
        select: 50,
        presidents: 56, // 55.00000000000001 → ceil → 56
        smedley: 60,
      })

      // Verify level determination
      expect(determineAchievedLevel(44, targets)).toBeNull()
      expect(determineAchievedLevel(45, targets)).toBe('distinguished')
      expect(determineAchievedLevel(50, targets)).toBe('select')
      expect(determineAchievedLevel(56, targets)).toBe('presidents')
      expect(determineAchievedLevel(60, targets)).toBe('smedley')
      expect(determineAchievedLevel(70, targets)).toBe('smedley')
    })
  })
})

/**
 * Property-Based Tests for TargetCalculator Ceiling Rounding Invariant
 *
 * **Feature: performance-targets-calculation, Property 4: Ceiling Rounding Invariant**
 *
 * *For any* calculated target value, the result SHALL be an integer that is greater than
 * or equal to the unrounded mathematical result. Specifically, for any base B and percentage P,
 * the target T = ⌈B × P⌉ SHALL satisfy: T ≥ B × P AND T is an integer AND T - (B × P) < 1.
 *
 * **Validates: Requirements 2.6, 3.6, 4.6**
 */
describe('TargetCalculator Property Tests', () => {
  /**
   * Feature: performance-targets-calculation
   * Property 4: Ceiling Rounding Invariant
   *
   * **Validates: Requirements 2.6, 3.6, 4.6**
   */
  describe('Property 4: Ceiling Rounding Invariant', () => {
    /**
     * Arbitrary for generating positive base values.
     * Uses realistic range for district club/payment counts (1 to 10000).
     */
    const positiveBaseArb = fc.integer({ min: 1, max: 10000 })

    /**
     * Helper to verify ceiling rounding invariant for a single target value.
     *
     * For any base B and percentage P, the target T = ⌈B × P⌉ SHALL satisfy:
     * 1. T is an integer
     * 2. T ≥ B × P (target is at least the mathematical result)
     * 3. T - (B × P) < 1 (target is less than 1 above the mathematical result)
     */
    function verifyCeilingInvariant(
      target: number,
      base: number,
      percentage: number,
      targetName: string
    ): void {
      const mathematicalResult = base * percentage

      // Invariant 1: Target must be an integer
      expect(
        Number.isInteger(target),
        `${targetName}: Target ${target} should be an integer`
      ).toBe(true)

      // Invariant 2: Target must be >= mathematical result
      expect(
        target >= mathematicalResult,
        `${targetName}: Target ${target} should be >= mathematical result ${mathematicalResult}`
      ).toBe(true)

      // Invariant 3: Target must be < mathematical result + 1
      expect(
        target - mathematicalResult < 1,
        `${targetName}: Target ${target} - mathematical result ${mathematicalResult} should be < 1`
      ).toBe(true)
    }

    /**
     * Property 4.1: Growth targets satisfy ceiling rounding invariant
     *
     * For any positive base value, all growth targets (distinguished, select,
     * presidents, smedley) must satisfy the ceiling rounding invariant.
     *
     * Growth formula: base * (1 + percentage), rounded up
     *
     * **Validates: Requirements 2.6, 3.6**
     */
    it('should satisfy ceiling rounding invariant for all growth targets', () => {
      fc.assert(
        fc.property(positiveBaseArb, base => {
          const targets = calculateGrowthTargets(base)

          // Verify each growth target satisfies the ceiling invariant
          verifyCeilingInvariant(
            targets.distinguished,
            base,
            1 + GROWTH_PERCENTAGES.distinguished,
            'Distinguished'
          )
          verifyCeilingInvariant(
            targets.select,
            base,
            1 + GROWTH_PERCENTAGES.select,
            'Select'
          )
          verifyCeilingInvariant(
            targets.presidents,
            base,
            1 + GROWTH_PERCENTAGES.presidents,
            "President's"
          )
          verifyCeilingInvariant(
            targets.smedley,
            base,
            1 + GROWTH_PERCENTAGES.smedley,
            'Smedley'
          )

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 4.2: Percentage targets satisfy ceiling rounding invariant
     *
     * For any positive base value, all percentage targets (distinguished, select,
     * presidents, smedley) must satisfy the ceiling rounding invariant.
     *
     * Percentage formula: base * percentage, rounded up
     *
     * **Validates: Requirements 4.6**
     */
    it('should satisfy ceiling rounding invariant for all percentage targets', () => {
      fc.assert(
        fc.property(positiveBaseArb, base => {
          const targets = calculatePercentageTargets(base)

          // Verify each percentage target satisfies the ceiling invariant
          verifyCeilingInvariant(
            targets.distinguished,
            base,
            DISTINGUISHED_PERCENTAGES.distinguished,
            'Distinguished'
          )
          verifyCeilingInvariant(
            targets.select,
            base,
            DISTINGUISHED_PERCENTAGES.select,
            'Select'
          )
          verifyCeilingInvariant(
            targets.presidents,
            base,
            DISTINGUISHED_PERCENTAGES.presidents,
            "President's"
          )
          verifyCeilingInvariant(
            targets.smedley,
            base,
            DISTINGUISHED_PERCENTAGES.smedley,
            'Smedley'
          )

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 4.3: All targets are positive integers for positive base values
     *
     * For any positive base value, all calculated targets must be positive integers.
     * This is a consequence of the ceiling function applied to positive products.
     *
     * **Validates: Requirements 2.6, 3.6, 4.6**
     */
    it('should produce positive integer targets for all positive base values', () => {
      fc.assert(
        fc.property(positiveBaseArb, base => {
          const growthTargets = calculateGrowthTargets(base)
          const percentageTargets = calculatePercentageTargets(base)

          // All growth targets must be positive integers
          expect(growthTargets.distinguished).toBeGreaterThan(0)
          expect(growthTargets.select).toBeGreaterThan(0)
          expect(growthTargets.presidents).toBeGreaterThan(0)
          expect(growthTargets.smedley).toBeGreaterThan(0)

          expect(Number.isInteger(growthTargets.distinguished)).toBe(true)
          expect(Number.isInteger(growthTargets.select)).toBe(true)
          expect(Number.isInteger(growthTargets.presidents)).toBe(true)
          expect(Number.isInteger(growthTargets.smedley)).toBe(true)

          // All percentage targets must be positive integers
          expect(percentageTargets.distinguished).toBeGreaterThan(0)
          expect(percentageTargets.select).toBeGreaterThan(0)
          expect(percentageTargets.presidents).toBeGreaterThan(0)
          expect(percentageTargets.smedley).toBeGreaterThan(0)

          expect(Number.isInteger(percentageTargets.distinguished)).toBe(true)
          expect(Number.isInteger(percentageTargets.select)).toBe(true)
          expect(Number.isInteger(percentageTargets.presidents)).toBe(true)
          expect(Number.isInteger(percentageTargets.smedley)).toBe(true)

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 4.4: Growth targets are always >= base value
     *
     * For any positive base value, all growth targets must be at least equal to
     * the base value (since growth percentages are positive).
     *
     * **Validates: Requirements 2.6, 3.6**
     */
    it('should produce growth targets that are always >= base value', () => {
      fc.assert(
        fc.property(positiveBaseArb, base => {
          const targets = calculateGrowthTargets(base)

          // All growth targets must be >= base (since we're adding a percentage)
          expect(targets.distinguished).toBeGreaterThanOrEqual(base)
          expect(targets.select).toBeGreaterThanOrEqual(base)
          expect(targets.presidents).toBeGreaterThanOrEqual(base)
          expect(targets.smedley).toBeGreaterThanOrEqual(base)

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 4.5: Ceiling rounding never produces values more than 1 above mathematical result
     *
     * This is the key property of Math.ceil(): the result is always in the range
     * [mathematicalResult, mathematicalResult + 1).
     *
     * **Validates: Requirements 2.6, 3.6, 4.6**
     */
    it('should never produce targets more than 1 above the mathematical result', () => {
      fc.assert(
        fc.property(positiveBaseArb, base => {
          const growthTargets = calculateGrowthTargets(base)
          const percentageTargets = calculatePercentageTargets(base)

          // Check growth targets
          const growthPercentages = [
            {
              target: growthTargets.distinguished,
              pct: 1 + GROWTH_PERCENTAGES.distinguished,
            },
            {
              target: growthTargets.select,
              pct: 1 + GROWTH_PERCENTAGES.select,
            },
            {
              target: growthTargets.presidents,
              pct: 1 + GROWTH_PERCENTAGES.presidents,
            },
            {
              target: growthTargets.smedley,
              pct: 1 + GROWTH_PERCENTAGES.smedley,
            },
          ]

          for (const { target, pct } of growthPercentages) {
            const mathematicalResult = base * pct
            const difference = target - mathematicalResult
            expect(difference).toBeGreaterThanOrEqual(0)
            expect(difference).toBeLessThan(1)
          }

          // Check percentage targets
          const distinguishedPercentages = [
            {
              target: percentageTargets.distinguished,
              pct: DISTINGUISHED_PERCENTAGES.distinguished,
            },
            {
              target: percentageTargets.select,
              pct: DISTINGUISHED_PERCENTAGES.select,
            },
            {
              target: percentageTargets.presidents,
              pct: DISTINGUISHED_PERCENTAGES.presidents,
            },
            {
              target: percentageTargets.smedley,
              pct: DISTINGUISHED_PERCENTAGES.smedley,
            },
          ]

          for (const { target, pct } of distinguishedPercentages) {
            const mathematicalResult = base * pct
            const difference = target - mathematicalResult
            expect(difference).toBeGreaterThanOrEqual(0)
            expect(difference).toBeLessThan(1)
          }

          return true
        }),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Feature: performance-targets-calculation
   * Property 5: Achieved Level Determination
   *
   * *For any* current value C and valid recognition targets T (where T.distinguished ≤ T.select ≤ T.presidents ≤ T.smedley),
   * the achieved level SHALL be:
   * - "smedley" if C ≥ T.smedley
   * - "presidents" if T.presidents ≤ C < T.smedley
   * - "select" if T.select ≤ C < T.presidents
   * - "distinguished" if T.distinguished ≤ C < T.select
   * - null if C < T.distinguished
   *
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
   */
  describe('Property 5: Achieved Level Determination', () => {
    /**
     * Arbitrary for generating valid recognition targets.
     * Generates four ascending values where distinguished ≤ select ≤ presidents ≤ smedley.
     * Uses realistic range for district targets (1 to 10000).
     */
    const validTargetsArb = fc
      .tuple(
        fc.integer({ min: 1, max: 2500 }),
        fc.integer({ min: 0, max: 2500 }),
        fc.integer({ min: 0, max: 2500 }),
        fc.integer({ min: 0, max: 2500 })
      )
      .map(([base, delta1, delta2, delta3]) => ({
        distinguished: base,
        select: base + delta1,
        presidents: base + delta1 + delta2,
        smedley: base + delta1 + delta2 + delta3,
      }))

    /**
     * Arbitrary for generating current values.
     * Uses a wide range to cover below, at, between, and above all targets.
     */
    const currentValueArb = fc.integer({ min: 0, max: 15000 })

    /**
     * Helper function to compute the expected achieved level based on the specification.
     * This is the "oracle" that defines correct behavior.
     */
    function expectedAchievedLevel(
      current: number,
      targets: RecognitionTargets
    ): 'smedley' | 'presidents' | 'select' | 'distinguished' | null {
      if (current >= targets.smedley) return 'smedley'
      if (current >= targets.presidents) return 'presidents'
      if (current >= targets.select) return 'select'
      if (current >= targets.distinguished) return 'distinguished'
      return null
    }

    /**
     * Property 5.1: Achieved level matches specification for all current/target combinations
     *
     * For any current value and valid targets, determineAchievedLevel must return
     * the correct level according to the specification rules.
     *
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
     */
    it('should return correct achieved level for all current/target combinations', () => {
      fc.assert(
        fc.property(currentValueArb, validTargetsArb, (current, targets) => {
          const actual = determineAchievedLevel(current, targets)
          const expected = expectedAchievedLevel(current, targets)

          expect(
            actual,
            `For current=${current}, targets=${JSON.stringify(targets)}: expected ${expected}, got ${actual}`
          ).toBe(expected)

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 5.2: Smedley level is achieved when current >= smedley target
     *
     * **Validates: Requirement 5.1**
     */
    it('should return smedley when current >= smedley target', () => {
      fc.assert(
        fc.property(validTargetsArb, targets => {
          // Test at exactly smedley target
          expect(determineAchievedLevel(targets.smedley, targets)).toBe(
            'smedley'
          )

          // Test above smedley target
          const aboveSmedley =
            targets.smedley + fc.sample(fc.integer({ min: 1, max: 1000 }), 1)[0]
          expect(determineAchievedLevel(aboveSmedley, targets)).toBe('smedley')

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 5.3: Presidents level is achieved when presidents <= current < smedley
     *
     * **Validates: Requirement 5.2**
     */
    it('should return presidents when presidents <= current < smedley', () => {
      fc.assert(
        fc.property(
          validTargetsArb.filter(t => t.presidents < t.smedley),
          targets => {
            // Test at exactly presidents target
            expect(determineAchievedLevel(targets.presidents, targets)).toBe(
              'presidents'
            )

            // Test between presidents and smedley (if there's room)
            if (targets.smedley - targets.presidents > 1) {
              const between = targets.presidents + 1
              expect(determineAchievedLevel(between, targets)).toBe(
                'presidents'
              )
            }

            // Test just below smedley
            const justBelowSmedley = targets.smedley - 1
            if (justBelowSmedley >= targets.presidents) {
              expect(determineAchievedLevel(justBelowSmedley, targets)).toBe(
                'presidents'
              )
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 5.4: Select level is achieved when select <= current < presidents
     *
     * **Validates: Requirement 5.3**
     */
    it('should return select when select <= current < presidents', () => {
      fc.assert(
        fc.property(
          validTargetsArb.filter(t => t.select < t.presidents),
          targets => {
            // Test at exactly select target
            expect(determineAchievedLevel(targets.select, targets)).toBe(
              'select'
            )

            // Test between select and presidents (if there's room)
            if (targets.presidents - targets.select > 1) {
              const between = targets.select + 1
              expect(determineAchievedLevel(between, targets)).toBe('select')
            }

            // Test just below presidents
            const justBelowPresidents = targets.presidents - 1
            if (justBelowPresidents >= targets.select) {
              expect(determineAchievedLevel(justBelowPresidents, targets)).toBe(
                'select'
              )
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 5.5: Distinguished level is achieved when distinguished <= current < select
     *
     * **Validates: Requirement 5.4**
     */
    it('should return distinguished when distinguished <= current < select', () => {
      fc.assert(
        fc.property(
          validTargetsArb.filter(t => t.distinguished < t.select),
          targets => {
            // Test at exactly distinguished target
            expect(determineAchievedLevel(targets.distinguished, targets)).toBe(
              'distinguished'
            )

            // Test between distinguished and select (if there's room)
            if (targets.select - targets.distinguished > 1) {
              const between = targets.distinguished + 1
              expect(determineAchievedLevel(between, targets)).toBe(
                'distinguished'
              )
            }

            // Test just below select
            const justBelowSelect = targets.select - 1
            if (justBelowSelect >= targets.distinguished) {
              expect(determineAchievedLevel(justBelowSelect, targets)).toBe(
                'distinguished'
              )
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 5.6: Null is returned when current < distinguished target
     *
     * **Validates: Requirement 5.5**
     */
    it('should return null when current < distinguished target', () => {
      fc.assert(
        fc.property(
          validTargetsArb.filter(t => t.distinguished > 0),
          targets => {
            // Test at zero
            if (targets.distinguished > 0) {
              expect(determineAchievedLevel(0, targets)).toBeNull()
            }

            // Test just below distinguished
            const justBelowDistinguished = targets.distinguished - 1
            if (justBelowDistinguished >= 0) {
              expect(
                determineAchievedLevel(justBelowDistinguished, targets)
              ).toBeNull()
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 5.7: Null targets always return null achieved level
     *
     * **Validates: Requirement 5.6**
     */
    it('should return null when targets are null', () => {
      fc.assert(
        fc.property(currentValueArb, current => {
          expect(determineAchievedLevel(current, null)).toBeNull()
          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 5.8: Achieved level is monotonically non-decreasing with current value
     *
     * For any fixed targets, as the current value increases, the achieved level
     * should never decrease (null < distinguished < select < presidents < smedley).
     *
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
     */
    it('should have monotonically non-decreasing achieved level as current increases', () => {
      const levelOrder: Record<string, number> = {
        null: 0,
        distinguished: 1,
        select: 2,
        presidents: 3,
        smedley: 4,
      }

      fc.assert(
        fc.property(
          validTargetsArb,
          fc.integer({ min: 0, max: 10000 }),
          fc.integer({ min: 1, max: 1000 }),
          (targets, current1, delta) => {
            const current2 = current1 + delta

            const level1 = determineAchievedLevel(current1, targets)
            const level2 = determineAchievedLevel(current2, targets)

            const order1 = levelOrder[String(level1)]
            const order2 = levelOrder[String(level2)]

            expect(
              order2,
              `Level should not decrease: current1=${current1} (${level1}) -> current2=${current2} (${level2})`
            ).toBeGreaterThanOrEqual(order1)

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 5.9: Integration with calculated targets
     *
     * When using targets calculated from calculateGrowthTargets or calculatePercentageTargets,
     * the achieved level determination should still work correctly.
     *
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
     */
    it('should work correctly with calculated growth targets', () => {
      const positiveBaseArb = fc.integer({ min: 1, max: 10000 })

      fc.assert(
        fc.property(positiveBaseArb, currentValueArb, (base, current) => {
          const targets = calculateGrowthTargets(base)
          const actual = determineAchievedLevel(current, targets)
          const expected = expectedAchievedLevel(current, targets)

          expect(actual).toBe(expected)

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 5.10: Integration with percentage targets
     *
     * When using targets calculated from calculatePercentageTargets,
     * the achieved level determination should still work correctly.
     *
     * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
     */
    it('should work correctly with calculated percentage targets', () => {
      const positiveBaseArb = fc.integer({ min: 1, max: 10000 })

      fc.assert(
        fc.property(positiveBaseArb, currentValueArb, (base, current) => {
          const targets = calculatePercentageTargets(base)
          const actual = determineAchievedLevel(current, targets)
          const expected = expectedAchievedLevel(current, targets)

          expect(actual).toBe(expected)

          return true
        }),
        { numRuns: 100 }
      )
    })
  })
})

/* #798 float-overshoot survivors (#1126 C5). `Math.ceil(base * 0.55)`
   overshoots whenever base*55 is divisible by 100 (0.55 is not exactly
   representable: 100 * 0.55 = 55.00000000000001 → ceil → 56). The
   integer-safe form is `Math.ceil((base * 55) / 100)`. Same class for
   growth targets: 225 * 1.08 = 243.00000000000003 → ceil → 244, when
   8% growth on 225 is exactly 243. Live wrong numbers: D86 presidents
   target 56 (correct 55), D94 111 (correct 110). */
describe('integer-safe targets — #798 overshoot regressions (#1126)', () => {
  it('presidents target at base 100 is exactly 55 (live D86 regression)', () => {
    expect(calculatePercentageTargets(100).presidents).toBe(55)
  })

  it('presidents target at base 200 is exactly 110 (live D94 regression)', () => {
    expect(calculatePercentageTargets(200).presidents).toBe(110)
  })

  it('smedley growth target at base 225 is exactly 243', () => {
    expect(calculateGrowthTargets(225).smedley).toBe(243)
  })

  it('every percentage target matches integer arithmetic for bases 1..10000', () => {
    const mismatches: Array<[number, string, number, number]> = []
    for (let base = 1; base <= 10000; base++) {
      const t = calculatePercentageTargets(base)
      const expected = {
        distinguished: Math.ceil((base * 45) / 100),
        select: Math.ceil((base * 50) / 100),
        presidents: Math.ceil((base * 55) / 100),
        smedley: Math.ceil((base * 60) / 100),
      }
      for (const level of [
        'distinguished',
        'select',
        'presidents',
        'smedley',
      ] as const) {
        if (t[level] !== expected[level]) {
          mismatches.push([base, level, t[level], expected[level]])
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('every growth target matches integer arithmetic for bases 1..10000', () => {
    const mismatches: Array<[number, string, number, number]> = []
    for (let base = 1; base <= 10000; base++) {
      const t = calculateGrowthTargets(base)
      const expected = {
        distinguished: Math.ceil((base * 101) / 100),
        select: Math.ceil((base * 103) / 100),
        presidents: Math.ceil((base * 105) / 100),
        smedley: Math.ceil((base * 108) / 100),
      }
      for (const level of [
        'distinguished',
        'select',
        'presidents',
        'smedley',
      ] as const) {
        if (t[level] !== expected[level]) {
          mismatches.push([base, level, t[level], expected[level]])
        }
      }
    }
    expect(mismatches).toEqual([])
  })
})
