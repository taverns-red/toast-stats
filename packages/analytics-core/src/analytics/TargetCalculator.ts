/**
 * Target Calculator Module
 *
 * Utility functions for calculating recognition level targets for district performance metrics.
 * Used by AnalyticsComputer to compute targets for:
 * - Paid Clubs (growth-based: base + percentage)
 * - Membership Payments (growth-based: base + percentage)
 * - Distinguished Clubs (percentage-based: percentage of base)
 *
 * All targets use integer-percent arithmetic — `Math.ceil((base * pct) / 100)`
 * — never `Math.ceil(base * (pct / 100))`. The float form overshoots whenever
 * the true product is a whole number that the binary representation nudges up
 * (100 × 0.55 = 55.00000000000001 → ceil → 56, when 55% of 100 is exactly 55).
 * Live wrong numbers D86/D94 (#798, #1126). `growthTarget` / `percentageTarget`
 * are the single source of truth for this form across the codebase — the
 * frontend countdown/division-gap utilities and DistinguishedDistrictCalculator
 * delegate here, pinned by the cross-implementation parity test
 * (frontend/src/utils/__tests__/recognitionTargetParity.test.ts).
 *
 * Requirements: 2.1-2.6, 3.1-3.6, 4.1-4.6, 5.1-5.6
 */

import type { RecognitionTargets, RecognitionLevel } from '../types.js'

/**
 * Recognition level growth percentages (whole percents) for paid clubs and
 * membership payments targets.
 * Formula: ceil(base × (100 + pct) / 100)
 *
 * Requirements: 2.1-2.4, 3.1-3.4
 */
export const GROWTH_PERCENTAGES = {
  distinguished: 1, // +1%
  select: 3, // +3%
  presidents: 5, // +5%
  smedley: 8, // +8%
} as const

/**
 * Recognition level percentages (whole percents) for distinguished clubs
 * targets.
 * Formula: ceil(base × pct / 100)
 *
 * Requirements: 4.1-4.4
 */
export const DISTINGUISHED_PERCENTAGES = {
  distinguished: 45, // 45%
  select: 50, // 50%
  presidents: 55, // 55%
  smedley: 60, // 60%
} as const

/**
 * "At least X% of base" target, rounded up, computed with integer-safe
 * arithmetic (#798). `base * wholePercent` is an exact integer, so the
 * division is exact whenever the true result is whole — no float overshoot.
 *
 * @param base - The base value (e.g. paidClubBase)
 * @param wholePercent - Threshold as a whole percent (e.g. 55 for 55%)
 */
export function percentageTarget(base: number, wholePercent: number): number {
  return Math.ceil((base * wholePercent) / 100)
}

/**
 * "Grow base by at least X%" target, rounded up, computed with integer-safe
 * arithmetic (#798): ceil(base × (100 + growthPercent) / 100).
 *
 * @param base - The base value (paidClubBase or paymentBase)
 * @param growthPercent - Required growth as a whole percent (e.g. 5 for +5%)
 */
export function growthTarget(base: number, growthPercent: number): number {
  return Math.ceil((base * (100 + growthPercent)) / 100)
}

/**
 * Calculates growth-based targets for paid clubs and membership payments.
 *
 * @param base - The base value (paidClubBase or paymentBase)
 * @returns Recognition targets for each level
 *
 * Requirements: 2.1-2.6, 3.1-3.6
 */
export function calculateGrowthTargets(base: number): RecognitionTargets {
  return {
    distinguished: growthTarget(base, GROWTH_PERCENTAGES.distinguished),
    select: growthTarget(base, GROWTH_PERCENTAGES.select),
    presidents: growthTarget(base, GROWTH_PERCENTAGES.presidents),
    smedley: growthTarget(base, GROWTH_PERCENTAGES.smedley),
  }
}

/**
 * Calculates percentage-based targets for distinguished clubs.
 *
 * @param base - The base value (paidClubBase)
 * @returns Recognition targets for each level
 *
 * Requirements: 4.1-4.6
 */
export function calculatePercentageTargets(base: number): RecognitionTargets {
  return {
    distinguished: percentageTarget(
      base,
      DISTINGUISHED_PERCENTAGES.distinguished
    ),
    select: percentageTarget(base, DISTINGUISHED_PERCENTAGES.select),
    presidents: percentageTarget(base, DISTINGUISHED_PERCENTAGES.presidents),
    smedley: percentageTarget(base, DISTINGUISHED_PERCENTAGES.smedley),
  }
}

/**
 * Determines the highest achieved recognition level based on current value and targets.
 * Returns null if below all targets or if targets are unavailable.
 *
 * The recognition levels are ordered from lowest to highest:
 * distinguished < select < presidents < smedley
 *
 * @param current - The current value of the metric
 * @param targets - The recognition targets (or null if unavailable)
 * @returns The highest achieved recognition level, or null if none achieved
 *
 * Requirements: 5.1-5.6
 */
export function determineAchievedLevel(
  current: number,
  targets: RecognitionTargets | null
): RecognitionLevel | null {
  if (targets === null) {
    return null
  }

  // Check from highest to lowest level
  if (current >= targets.smedley) {
    return 'smedley'
  }
  if (current >= targets.presidents) {
    return 'presidents'
  }
  if (current >= targets.select) {
    return 'select'
  }
  if (current >= targets.distinguished) {
    return 'distinguished'
  }

  return null
}
