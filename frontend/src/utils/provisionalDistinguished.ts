/**
 * Client-side provisional Distinguished detection (#291, #296).
 *
 * Derives whether a Distinguished club's status is provisional
 * from existing CDN fields, avoiding pipeline dependency.
 *
 * Business rule:
 * - Pre-April data (Jul-Mar): membership count includes non-renewers.
 *   Only aprilRenewals are confirmed. Each level has different
 *   thresholds (#296):
 *   - Smedley: 25 members (no net growth alternative)
 *   - President: 20 members (no net growth alternative)
 *   - Select: 20 members OR net growth >= 5
 *   - Distinguished: 20 members OR net growth >= 3
 * - Post-April data (Apr-Jun): membership count reflects reality.
 *   All Distinguished = confirmed.
 */

import {
  getConfirmedDistinguishedLevel,
  getCSPStatus,
  isDistinguishedProvisional,
} from '@taverns-red/analytics-core'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import type { DistinguishedLevel } from '@taverns-red/analytics-core'

/**
 * Determine if a Distinguished club's status is provisional.
 *
 * Uses the CDN field `isProvisionallyDistinguished` if available,
 * otherwise computes from aprilRenewals + membershipBase + date.
 *
 * @param club - Club trend data from CDN
 * @param snapshotDate - Snapshot date string (YYYY-MM-DD).
 *   If omitted, uses the last date in membershipTrend as a proxy.
 * @returns true if Distinguished status is provisional
 */
export function isProvisionallyDistinguished(
  club: ClubTrend,
  snapshotDate?: string
): boolean {
  // If CDN already computed it, use that
  if (club.isProvisionallyDistinguished !== undefined) {
    return club.isProvisionallyDistinguished
  }

  // Not distinguished = not provisional
  if (
    !club.distinguishedLevel ||
    club.distinguishedLevel === 'NotDistinguished'
  ) {
    return false
  }

  // Determine data month from snapshot date or last trend entry
  const effectiveDate =
    snapshotDate ?? club.membershipTrend[club.membershipTrend.length - 1]?.date
  if (!effectiveDate) return false
  const month = new Date(effectiveDate).getUTCMonth() + 1

  // The rule itself (post-April confirmed; pre-April, do April renewals
  // alone hold THIS level, #296) lives in analytics-core, the same rule the
  // pipeline's distinguishedCounts use (#2553).
  return isDistinguishedProvisional(
    club.distinguishedLevel,
    club.aprilRenewals ?? 0,
    club.membershipBase ?? 0,
    month
  )
}

// Distinguished level thresholds for display (#297)
const LEVEL_THRESHOLDS: Record<string, { members: number; growth?: number }> = {
  Smedley: { members: 25 },
  President: { members: 20 },
  Select: { members: 20, growth: 5 },
  Distinguished: { members: 20, growth: 3 },
}

/**
 * Get the confirmed Distinguished level using only April renewals
 * as the membership count. Returns the highest level achievable
 * with confirmed renewals.
 *
 * @param club - Club trend data from CDN
 * @param programYear - Program year the trend belongs to ("YYYY-YYYY"),
 *   threaded from the page that owns the program-year selection. The club
 *   Smedley rung did not exist before 2025-26 (#1406). Omitted → current
 *   rules.
 */
export function getConfirmedLevel(
  club: ClubTrend,
  programYear?: string
): DistinguishedLevel {
  // CSP gate (#1139): a club without a submitted Club Success Plan cannot be
  // confirmed Distinguished (2025-2026+). Source the rule from analytics-core
  // (undefined → submitted for pre-2025-26 historical data).
  if (!getCSPStatus(club)) return 'NotDistinguished'

  const renewals = club.aprilRenewals ?? 0
  const base = club.membershipBase ?? 0
  const trend = club.dcpGoalsTrend
  const lastEntry = trend.length > 0 ? trend[trend.length - 1] : undefined
  const goals = lastEntry?.goalsAchieved ?? 0

  // The ladder itself lives in analytics-core so the rungs, and which of
  // them the program year had, have one definition (#1406).
  return getConfirmedDistinguishedLevel(goals, renewals, base, programYear)
}

/**
 * Get a human-readable description of what's needed to confirm
 * the club's current Distinguished level.
 */
export function getProvisionalTooltip(
  club: ClubTrend,
  programYear?: string
): string {
  const level = club.distinguishedLevel ?? 'NotDistinguished'
  const thresholds = LEVEL_THRESHOLDS[level]
  if (!thresholds) return ''

  const renewals = club.aprilRenewals ?? 0
  const confirmedLevel = getConfirmedLevel(club, programYear)
  const confirmedLabel =
    confirmedLevel === 'NotDistinguished'
      ? 'no Distinguished status'
      : confirmedLevel === 'President'
        ? "President's"
        : confirmedLevel

  const parts = [`Requires ${thresholds.members} members`]
  if (thresholds.growth) {
    parts[0] += ` or net growth of ${thresholds.growth}+`
  }
  parts.push(`confirmed via April renewals.`)
  parts.push(`Currently ${renewals} confirmed.`)
  parts.push(`Falls back to ${confirmedLabel}.`)

  return parts.join(' ')
}
