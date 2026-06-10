/**
 * Club Eligibility Utility Functions
 *
 * Single source of truth for club eligibility calculations used across
 * ClubHealthAnalyticsModule, DistinguishedClubAnalyticsModule, and
 * AreaDivisionRecognitionModule.
 *
 * These functions were extracted to eliminate duplication and fix Bug 1:
 * inconsistent 'Presidents' vs 'President' return values.
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 5.3, 5.4, 5.5
 */

import type { ClubStatistics } from '../interfaces.js'
import type { ClubHealthStatus, DistinguishedLevel } from '../types.js'
import { getDCPCheckpoint } from './AnalyticsUtils.js'

/**
 * Scalar inputs for club-health classification.
 *
 * Value-based (not tied to ClubStatistics) so both transformed club data
 * and raw scraped CSV records can be classified by the same rule.
 */
export interface ClubHealthClassificationInput {
  /** Current active membership count */
  membership: number
  /** Membership base at the start of the program year */
  membershipBase: number
  /** DCP goals achieved to date */
  dcpGoals: number
  /** Normalized CSP submission status (pre-2025 data → true) */
  cspSubmitted: boolean
}

/**
 * Classification verdict with the per-requirement breakdown, so callers
 * can build risk-factor messages without re-deriving the predicates.
 */
export interface ClubHealthClassification {
  status: ClubHealthStatus
  netGrowth: number
  requiredDcpCheckpoint: number
  membershipRequirementMet: boolean
  dcpCheckpointMet: boolean
  cspRequirementMet: boolean
}

/**
 * Classify a club's health per the §5 monthly-checkpoint system.
 *
 * Single source of truth (#1120) — ClubHealthAnalyticsModule.assessClubHealth
 * and TimeSeriesDataPointBuilder.calculateClubHealthCounts must both
 * delegate here so dashboard and time-series counts cannot drift.
 *
 * @param input - Scalar club metrics (see ClubHealthClassificationInput)
 * @param month - Calendar month (1-12) of the snapshot date
 * @returns Classification with per-requirement breakdown
 */
export function classifyClubHealth(
  input: ClubHealthClassificationInput,
  month: number
): ClubHealthClassification {
  const { membership, membershipBase, dcpGoals, cspSubmitted } = input
  const netGrowth = membership - membershipBase
  const requiredDcpCheckpoint = getDCPCheckpoint(month)

  // Membership requirement: >= 20 members OR net growth >= 3
  const membershipRequirementMet = membership >= 20 || netGrowth >= 3
  // DCP checkpoint requirement varies by month (§5.3)
  const dcpCheckpointMet = dcpGoals >= requiredDcpCheckpoint
  const cspRequirementMet = cspSubmitted

  // Intervention override: membership < 12 AND net growth < 3
  let status: ClubHealthStatus
  if (membership < 12 && netGrowth < 3) {
    status = 'intervention-required'
  } else if (
    membershipRequirementMet &&
    dcpCheckpointMet &&
    cspRequirementMet
  ) {
    status = 'thriving'
  } else {
    status = 'vulnerable'
  }

  return {
    status,
    netGrowth,
    requiredDcpCheckpoint,
    membershipRequirementMet,
    dcpCheckpointMet,
    cspRequirementMet,
  }
}

/**
 * Calculate net growth for a club.
 *
 * Net growth = Active Members - Membership Base
 * Handles missing or zero membershipBase gracefully (defaults to 0).
 *
 * Requirements: 2.1, 2.2
 *
 * @param club - Club statistics data
 * @returns Net growth value (can be negative if membership declined)
 */
export function calculateNetGrowth(club: ClubStatistics): number {
  const currentMembers = club.membershipCount
  const membershipBase = club.membershipBase ?? 0
  return currentMembers - membershipBase
}

/**
 * Determine the distinguished level for a club based on DCP goals,
 * membership, and net growth.
 *
 * Per Toastmasters Distinguished Club Program (§3.2):
 * - Smedley Distinguished:     10 goals + 25 members
 * - President's Distinguished:  9 goals + 20 members
 * - Select Distinguished:       7 goals + (20 members OR net growth >= 5)
 * - Distinguished:              5 goals + (20 members OR net growth >= 3)
 *
 * Returns the HIGHEST applicable level. Levels are evaluated top-down
 * so Smedley (most restrictive) is checked first.
 *
 * Returns values matching the DistinguishedLevel type:
 * 'Smedley' | 'President' | 'Select' | 'Distinguished' | 'NotDistinguished'
 *
 * NOTE: The canonical return value for President's Distinguished is 'President'
 * (without trailing 's') to match the DistinguishedLevel type union.
 *
 * @param dcpGoals - Number of DCP goals achieved
 * @param membership - Current membership count
 * @param netGrowth - Net membership growth (current - base)
 * @returns Distinguished level classification
 */
export function determineDistinguishedLevel(
  dcpGoals: number,
  membership: number,
  netGrowth: number
): DistinguishedLevel {
  // Smedley Distinguished: 10 goals + 25 members
  if (dcpGoals >= 10 && membership >= 25) {
    return 'Smedley'
  }
  // President's Distinguished: 9 goals + 20 members
  if (dcpGoals >= 9 && membership >= 20) {
    return 'President'
  }
  // Select Distinguished: 7 goals + (20 members OR net growth of 5+)
  if (dcpGoals >= 7 && (membership >= 20 || netGrowth >= 5)) {
    return 'Select'
  }
  // Distinguished: 5 goals + (20 members OR net growth of 3+)
  if (dcpGoals >= 5 && (membership >= 20 || netGrowth >= 3)) {
    return 'Distinguished'
  }

  return 'NotDistinguished'
}

/**
 * Get CSP (Club Success Plan) submission status from club data.
 *
 * CSP data availability by program year:
 * - 2025-2026 and later: CSP field is present in CSV data → cspSubmitted is boolean
 * - Prior to 2025-2026: CSP column did not exist → cspSubmitted is undefined
 *
 * When cspSubmitted is undefined (pre-2025 data), we assume CSP was submitted
 * for backward compatibility — CSP was not a requirement before 2025-2026.
 *
 * @param club - Club statistics data
 * @returns true if CSP is submitted or field is absent (historical data), false otherwise
 */
export function getCSPStatus(club: ClubStatistics): boolean {
  // If cspSubmitted is undefined, this is pre-2025 data — assume submitted
  return club.cspSubmitted ?? true
}

/**
 * Determines if a Distinguished club's status is provisional (unconfirmed
 * by April renewals) or confirmed.
 *
 * Before April data arrives, membership count includes members who may not
 * renew. Only `aprilRenewals` are confirmed to stay. After April (dataMonth
 * >= 4), currentMemberCount reflects reality and is authoritative.
 *
 * Program year runs July–June, so months 4–6 (Apr–Jun) are "post-April"
 * and months 7–12, 1–3 (Jul–Mar) are "pre-April".
 *
 * @param distinguishedLevel - The club's computed Distinguished level
 * @param aprilRenewals - Number of members who paid April dues
 * @param membershipBase - Membership base from start of program year
 * @param dataMonth - Month of the data (1–12), from CSV footer or snapshot date
 * @returns true if Distinguished status is provisional (pre-April, unconfirmed)
 */
export function isDistinguishedProvisional(
  distinguishedLevel: DistinguishedLevel,
  aprilRenewals: number,
  membershipBase: number,
  dataMonth: number
): boolean {
  if (distinguishedLevel === 'NotDistinguished') return false

  // Post-April data (Apr=4, May=5, Jun=6): membership count is confirmed
  if (dataMonth >= 4 && dataMonth <= 6) return false

  // Pre-April (Jul=7 through Mar=3): check if aprilRenewals alone qualify
  // Each level has different membership requirements (#296)
  const confirmedNetGrowth = aprilRenewals - membershipBase
  let qualifiesOnConfirmed: boolean
  switch (distinguishedLevel) {
    case 'Smedley':
      qualifiesOnConfirmed = aprilRenewals >= 25
      break
    case 'President':
      qualifiesOnConfirmed = aprilRenewals >= 20
      break
    case 'Select':
      qualifiesOnConfirmed = aprilRenewals >= 20 || confirmedNetGrowth >= 5
      break
    case 'Distinguished':
      qualifiesOnConfirmed = aprilRenewals >= 20 || confirmedNetGrowth >= 3
      break
    default:
      qualifiesOnConfirmed = false
  }

  return !qualifiesOnConfirmed
}

/**
 * Compute the highest Distinguished level a club would achieve using
 * only confirmed April renewals as the membership count.
 *
 * This is the "fallback" level — what the club can confirm today vs.
 * the aspirational level based on current (unconfirmed) membership.
 *
 * @param dcpGoals - Number of DCP goals achieved
 * @param aprilRenewals - Number of members who paid April dues
 * @param membershipBase - Membership base from start of program year
 * @returns The highest Distinguished level achievable with confirmed renewals
 */
export function getConfirmedDistinguishedLevel(
  dcpGoals: number,
  aprilRenewals: number,
  membershipBase: number
): DistinguishedLevel {
  const confirmedNetGrowth = aprilRenewals - membershipBase
  return determineDistinguishedLevel(
    dcpGoals,
    aprilRenewals,
    confirmedNetGrowth
  )
}
