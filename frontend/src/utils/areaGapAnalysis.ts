/**
 * Area Gap Analysis Calculation Module
 *
 * This module provides functions for calculating gap analysis for areas
 * in the Distinguished Area Program (DAP). It determines what an area
 * needs to achieve each recognition level.
 *
 * DAP Criteria (from TOASTMASTERS_DASHBOARD_KNOWLEDGE.md):
 * - Eligibility: No net club loss (paidClubs >= clubBase)
 * - Distinguished Area: paidClubs >= clubBase AND distinguishedClubs >= 50% of clubBase
 * - Select Distinguished Area: paidClubs >= clubBase AND distinguishedClubs >= 50% of clubBase + 1
 * - President's Distinguished Area: paidClubs >= clubBase + 1 AND distinguishedClubs >= 50% of clubBase + 1
 *
 * Key differences from previous implementation:
 * - Distinguished percentage is calculated against club base, not paid clubs
 * - Paid clubs threshold is >= club base (no net loss), not 75%
 * - Select Distinguished requires 50% + 1 additional club
 * - President's Distinguished requires club base + 1 paid clubs AND 50% + 1 distinguished
 *
 * Requirements: 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

/**
 * Recognition levels for areas in the Distinguished Area Program
 *
 * - 'none': Does not meet any recognition level criteria
 * - 'distinguished': Meets Distinguished Area criteria
 * - 'select': Meets Select Distinguished Area criteria
 * - 'presidents': Meets President's Distinguished Area criteria
 */
export type RecognitionLevel =
  'none' | 'distinguished' | 'select' | 'presidents'

/**
 * Gap information for achieving a specific recognition level
 */
export interface GapToLevel {
  /** Whether this level is already achieved */
  achieved: boolean
  /** Number of additional distinguished clubs needed (0 if achieved) */
  distinguishedClubsNeeded: number
  /**
   * @deprecated Use distinguishedClubsNeeded instead. Kept for backward compatibility.
   */
  clubsNeeded: number
  /** Number of additional paid clubs needed for this level (0 if met) */
  paidClubsNeeded: number
  /** Whether this level is achievable (no net loss requirement met) */
  achievable: boolean
}

/**
 * Complete gap analysis for an area
 *
 * Contains the current recognition level achieved and the gaps
 * to each recognition level, including whether the no net club loss
 * requirement is met.
 */
export interface GapAnalysis {
  /** Current recognition level achieved */
  currentLevel: RecognitionLevel
  /** Whether no net club loss requirement is met (paidClubs >= clubBase) */
  meetsNoNetLossRequirement: boolean
  /**
   * @deprecated Use meetsNoNetLossRequirement instead. Kept for backward compatibility.
   */
  meetsPaidThreshold: boolean
  /** Number of additional paid clubs needed to meet club base (0 if met) */
  paidClubsNeeded: number
  /** Gap to Distinguished level */
  distinguishedGap: GapToLevel
  /** Gap to Select Distinguished level */
  selectGap: GapToLevel
  /** Gap to President's Distinguished level */
  presidentsGap: GapToLevel
}

/**
 * Input parameters for gap analysis calculation
 */
export interface AreaMetrics {
  /** Number of clubs at the start of the program year (club base) */
  clubBase: number
  /** Current number of clubs that have met membership payment requirements */
  paidClubs: number
  /** Current number of clubs that have achieved Distinguished status */
  distinguishedClubs: number
}

/**
 * Calculates the number of paid clubs needed to meet the no net club loss requirement
 *
 * Property 6: Paid Clubs Gap
 * - For Distinguished/Select: max(0, clubBase - paidClubs)
 * - For President's: max(0, clubBase + 1 - paidClubs)
 *
 * This function calculates the base requirement (no net loss).
 *
 * @param clubBase - Number of clubs at the start of the program year
 * @param paidClubs - Current number of paid clubs
 * @returns Number of additional paid clubs needed (0 if requirement met)
 *
 * @example
 * calculatePaidClubsGap(4, 3) // Returns 1 (need 4 paid clubs, have 3)
 * calculatePaidClubsGap(4, 4) // Returns 0 (requirement met)
 * calculatePaidClubsGap(0, 0) // Returns 0 (edge case: no clubs)
 *
 * Requirements: 6.1
 */
export function calculatePaidClubsGap(
  clubBase: number,
  paidClubs: number
): number {
  // Edge case: zero clubs means no gap
  if (clubBase === 0) {
    return 0
  }

  // No net club loss: paidClubs must be >= clubBase
  return Math.max(0, clubBase - paidClubs)
}

/**
 * Calculates the paid clubs percentage (of club base)
 *
 * Property 3: Paid Clubs Percentage = Math.round((paidClubs / clubBase) * 100)
 *
 * @param clubBase - Number of clubs at the start of the program year
 * @param paidClubs - Current number of paid clubs
 * @returns Paid clubs percentage (0-100+), 0 when clubBase is 0
 *
 * Requirements: 5.4
 */
export function calculatePaidClubsPercentage(
  clubBase: number,
  paidClubs: number
): number {
  if (clubBase === 0) {
    return 0
  }
  return Math.round((paidClubs / clubBase) * 100)
}

/**
 * Calculates the distinguished clubs percentage (of club base)
 *
 * Property 4: Distinguished Clubs Percentage = Math.round((distinguishedClubs / clubBase) * 100)
 * When clubBase = 0, the percentage should be 0.
 *
 * Note: This is calculated against club base, NOT paid clubs.
 *
 * @param clubBase - Number of clubs at the start of the program year
 * @param distinguishedClubs - Current number of distinguished clubs
 * @returns Distinguished clubs percentage (0-100+), 0 when clubBase is 0
 *
 * Requirements: 5.5
 */
export function calculateDistinguishedPercentage(
  clubBase: number,
  distinguishedClubs: number
): number {
  if (clubBase === 0) {
    return 0
  }
  return Math.round((distinguishedClubs / clubBase) * 100)
}

/**
 * Calculates the required number of distinguished clubs for a given threshold
 *
 * @param clubBase - Number of clubs at the start of the program year
 * @param additionalClubs - Additional clubs required beyond 50% (0 for Distinguished, 1 for Select/Presidents)
 * @returns Required number of distinguished clubs
 */
function calculateRequiredDistinguishedClubs(
  clubBase: number,
  additionalClubs: number
): number {
  // 50% of club base, rounded up, plus any additional clubs
  return Math.ceil(clubBase * 0.5) + additionalClubs
}

/**
 * Determines the current recognition level based on metrics
 *
 * Property 5: Recognition Level Classification
 * - If paidClubs < clubBase: "none" (net club loss - not eligible)
 * - Else if paidClubs >= clubBase + 1 AND distinguishedClubs >= Math.ceil(clubBase * 0.50) + 1: "presidents"
 * - Else if paidClubs >= clubBase AND distinguishedClubs >= Math.ceil(clubBase * 0.50) + 1: "select"
 * - Else if paidClubs >= clubBase AND distinguishedClubs >= Math.ceil(clubBase * 0.50): "distinguished"
 * - Else: "none"
 *
 * @param metrics - Area metrics (clubBase, paidClubs, distinguishedClubs)
 * @returns Current recognition level achieved
 *
 * Requirements: 5.6, 6.5
 */
export function determineRecognitionLevel(
  metrics: AreaMetrics
): RecognitionLevel {
  const { clubBase, paidClubs, distinguishedClubs } = metrics

  // Edge case: zero clubs means no recognition possible
  if (clubBase === 0) {
    return 'none'
  }

  // Check no net club loss requirement first (paidClubs >= clubBase)
  if (paidClubs < clubBase) {
    return 'none'
  }

  // Calculate distinguished thresholds
  const distinguishedThreshold = calculateRequiredDistinguishedClubs(
    clubBase,
    0
  ) // 50% of clubBase
  const selectThreshold = calculateRequiredDistinguishedClubs(clubBase, 1) // 50% of clubBase + 1

  // Check President's Distinguished: paidClubs >= clubBase + 1 AND distinguishedClubs >= 50% + 1
  if (paidClubs >= clubBase + 1 && distinguishedClubs >= selectThreshold) {
    return 'presidents'
  }

  // Check Select Distinguished: paidClubs >= clubBase AND distinguishedClubs >= 50% + 1
  if (paidClubs >= clubBase && distinguishedClubs >= selectThreshold) {
    return 'select'
  }

  // Check Distinguished: paidClubs >= clubBase AND distinguishedClubs >= 50%
  if (paidClubs >= clubBase && distinguishedClubs >= distinguishedThreshold) {
    return 'distinguished'
  }

  return 'none'
}

/**
 * Calculates the gap to Distinguished level
 *
 * Distinguished: paidClubs >= clubBase AND distinguishedClubs >= 50% of clubBase
 *
 * @param metrics - Area metrics
 * @param meetsNoNetLossRequirement - Whether no net club loss requirement is met
 * @returns Gap information for Distinguished level
 *
 * Requirements: 6.2, 6.6
 */
function calculateDistinguishedGap(
  metrics: AreaMetrics,
  meetsNoNetLossRequirement: boolean
): GapToLevel {
  const { clubBase, paidClubs, distinguishedClubs } = metrics

  // Property 8: If no net loss requirement not met, level is not achievable
  if (!meetsNoNetLossRequirement) {
    return {
      achieved: false,
      distinguishedClubsNeeded: 0,
      clubsNeeded: 0, // backward compatibility
      paidClubsNeeded: Math.max(0, clubBase - paidClubs),
      achievable: false,
    }
  }

  // Edge case: zero clubs
  if (clubBase === 0) {
    return {
      achieved: false,
      distinguishedClubsNeeded: 0,
      clubsNeeded: 0, // backward compatibility
      paidClubsNeeded: 0,
      achievable: false,
    }
  }

  // Distinguished requires: paidClubs >= clubBase (already met) AND distinguishedClubs >= 50% of clubBase
  const requiredDistinguished = calculateRequiredDistinguishedClubs(clubBase, 0)
  const distinguishedClubsNeeded = Math.max(
    0,
    requiredDistinguished - distinguishedClubs
  )
  const achieved = distinguishedClubsNeeded === 0

  return {
    achieved,
    distinguishedClubsNeeded,
    clubsNeeded: distinguishedClubsNeeded, // backward compatibility
    paidClubsNeeded: 0, // No net loss already met
    achievable: true,
  }
}

/**
 * Calculates the gap to Select Distinguished level
 *
 * Select Distinguished: paidClubs >= clubBase AND distinguishedClubs >= 50% of clubBase + 1
 *
 * @param metrics - Area metrics
 * @param meetsNoNetLossRequirement - Whether no net club loss requirement is met
 * @returns Gap information for Select Distinguished level
 *
 * Requirements: 6.3, 6.6
 */
function calculateSelectGap(
  metrics: AreaMetrics,
  meetsNoNetLossRequirement: boolean
): GapToLevel {
  const { clubBase, paidClubs, distinguishedClubs } = metrics

  // Property 8: If no net loss requirement not met, level is not achievable
  if (!meetsNoNetLossRequirement) {
    return {
      achieved: false,
      distinguishedClubsNeeded: 0,
      clubsNeeded: 0, // backward compatibility
      paidClubsNeeded: Math.max(0, clubBase - paidClubs),
      achievable: false,
    }
  }

  // Edge case: zero clubs
  if (clubBase === 0) {
    return {
      achieved: false,
      distinguishedClubsNeeded: 0,
      clubsNeeded: 0, // backward compatibility
      paidClubsNeeded: 0,
      achievable: false,
    }
  }

  // Select requires: paidClubs >= clubBase (already met) AND distinguishedClubs >= 50% of clubBase + 1
  const requiredDistinguished = calculateRequiredDistinguishedClubs(clubBase, 1)
  const distinguishedClubsNeeded = Math.max(
    0,
    requiredDistinguished - distinguishedClubs
  )
  const achieved = distinguishedClubsNeeded === 0

  return {
    achieved,
    distinguishedClubsNeeded,
    clubsNeeded: distinguishedClubsNeeded, // backward compatibility
    paidClubsNeeded: 0, // No net loss already met
    achievable: true,
  }
}

/**
 * Calculates the gap to President's Distinguished level
 *
 * President's Distinguished: paidClubs >= clubBase + 1 AND distinguishedClubs >= 50% of clubBase + 1
 *
 * @param metrics - Area metrics
 * @param meetsNoNetLossRequirement - Whether no net club loss requirement is met
 * @returns Gap information for President's Distinguished level
 *
 * Requirements: 6.4, 6.6
 */
function calculatePresidentsGap(
  metrics: AreaMetrics,
  meetsNoNetLossRequirement: boolean
): GapToLevel {
  const { clubBase, paidClubs, distinguishedClubs } = metrics

  // Property 8: If no net loss requirement not met, level is not achievable
  if (!meetsNoNetLossRequirement) {
    return {
      achieved: false,
      distinguishedClubsNeeded: 0,
      clubsNeeded: 0, // backward compatibility
      paidClubsNeeded: Math.max(0, clubBase - paidClubs),
      achievable: false,
    }
  }

  // Edge case: zero clubs
  if (clubBase === 0) {
    return {
      achieved: false,
      distinguishedClubsNeeded: 0,
      clubsNeeded: 0, // backward compatibility
      paidClubsNeeded: 0,
      achievable: false,
    }
  }

  // President's requires: paidClubs >= clubBase + 1 AND distinguishedClubs >= 50% of clubBase + 1
  const requiredPaidClubs = clubBase + 1
  const requiredDistinguished = calculateRequiredDistinguishedClubs(clubBase, 1)

  const paidClubsNeeded = Math.max(0, requiredPaidClubs - paidClubs)
  const distinguishedClubsNeeded = Math.max(
    0,
    requiredDistinguished - distinguishedClubs
  )

  // Achieved only if both requirements are met
  const achieved = paidClubsNeeded === 0 && distinguishedClubsNeeded === 0

  return {
    achieved,
    distinguishedClubsNeeded,
    clubsNeeded: distinguishedClubsNeeded, // backward compatibility
    paidClubsNeeded,
    achievable: true, // Achievable since no net loss is met
  }
}

/**
 * Calculates complete gap analysis for an area
 *
 * This function determines the current recognition level and calculates
 * the gaps to each recognition level (Distinguished, Select Distinguished,
 * President's Distinguished).
 *
 * DAP Thresholds:
 * - Eligibility: No net club loss (paidClubs >= clubBase)
 * - Distinguished Area: paidClubs >= clubBase AND distinguishedClubs >= 50% of clubBase
 * - Select Distinguished Area: paidClubs >= clubBase AND distinguishedClubs >= 50% of clubBase + 1
 * - President's Distinguished Area: paidClubs >= clubBase + 1 AND distinguishedClubs >= 50% of clubBase + 1
 *
 * Properties implemented:
 * - Property 3: Paid Clubs Percentage calculation
 * - Property 4: Distinguished Clubs Percentage calculation (against club base)
 * - Property 5: Recognition Level Classification
 * - Property 6: Paid Clubs Gap calculation
 * - Property 7: Distinguished Clubs Gaps for each level
 * - Property 8: No Net Loss Blocker Display
 *
 * @param metrics - Area metrics (clubBase, paidClubs, distinguishedClubs)
 * @returns Complete gap analysis for the area
 *
 * @example
 * // Area with 4 clubs, 4 paid, 2 distinguished
 * calculateAreaGapAnalysis({ clubBase: 4, paidClubs: 4, distinguishedClubs: 2 })
 * // Returns: {
 * //   currentLevel: 'distinguished',
 * //   meetsNoNetLossRequirement: true,
 * //   paidClubsNeeded: 0,
 * //   distinguishedGap: { achieved: true, distinguishedClubsNeeded: 0, paidClubsNeeded: 0, achievable: true },
 * //   selectGap: { achieved: false, distinguishedClubsNeeded: 1, paidClubsNeeded: 0, achievable: true },
 * //   presidentsGap: { achieved: false, distinguishedClubsNeeded: 1, paidClubsNeeded: 1, achievable: true }
 * // }
 *
 * @example
 * // Area with net club loss (paidClubs < clubBase)
 * calculateAreaGapAnalysis({ clubBase: 4, paidClubs: 3, distinguishedClubs: 2 })
 * // Returns: {
 * //   currentLevel: 'none',
 * //   meetsNoNetLossRequirement: false,
 * //   paidClubsNeeded: 1,
 * //   distinguishedGap: { achieved: false, distinguishedClubsNeeded: 0, paidClubsNeeded: 1, achievable: false },
 * //   selectGap: { achieved: false, distinguishedClubsNeeded: 0, paidClubsNeeded: 1, achievable: false },
 * //   presidentsGap: { achieved: false, distinguishedClubsNeeded: 0, paidClubsNeeded: 1, achievable: false }
 * // }
 *
 * Requirements: 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export function calculateAreaGapAnalysis(metrics: AreaMetrics): GapAnalysis {
  const { clubBase, paidClubs } = metrics

  // Calculate paid clubs gap for no net loss requirement (Property 6)
  const paidClubsNeeded = calculatePaidClubsGap(clubBase, paidClubs)

  // Determine if no net loss requirement is met
  const meetsNoNetLossRequirement = paidClubsNeeded === 0 && clubBase > 0

  // Determine current recognition level (Property 5)
  const currentLevel = determineRecognitionLevel(metrics)

  // Calculate gaps to each level (Property 7, Property 8)
  const distinguishedGap = calculateDistinguishedGap(
    metrics,
    meetsNoNetLossRequirement
  )

  const selectGap = calculateSelectGap(metrics, meetsNoNetLossRequirement)

  const presidentsGap = calculatePresidentsGap(
    metrics,
    meetsNoNetLossRequirement
  )

  return {
    currentLevel,
    meetsNoNetLossRequirement,
    meetsPaidThreshold: meetsNoNetLossRequirement, // backward compatibility
    paidClubsNeeded,
    distinguishedGap,
    selectGap,
    presidentsGap,
  }
}
