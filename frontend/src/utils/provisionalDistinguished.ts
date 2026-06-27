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

import { getCSPStatus } from '@taverns-red/analytics-core'
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

  // Post-April (Apr=4, May=5, Jun=6): membership is confirmed
  if (month >= 4 && month <= 6) return false

  // Pre-April: check if aprilRenewals alone qualify for THIS level (#296)
  const renewals = club.aprilRenewals ?? 0
  const base = club.membershipBase ?? 0
  const confirmedNetGrowth = renewals - base

  let qualifiesOnConfirmed: boolean
  switch (club.distinguishedLevel) {
    case 'Smedley':
      qualifiesOnConfirmed = renewals >= 25
      break
    case 'President':
      qualifiesOnConfirmed = renewals >= 20
      break
    case 'Select':
      qualifiesOnConfirmed = renewals >= 20 || confirmedNetGrowth >= 5
      break
    case 'Distinguished':
      qualifiesOnConfirmed = renewals >= 20 || confirmedNetGrowth >= 3
      break
    default:
      qualifiesOnConfirmed = false
  }

  return !qualifiesOnConfirmed
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
 */
export function getConfirmedLevel(club: ClubTrend): DistinguishedLevel {
  // CSP gate (#1139): a club without a submitted Club Success Plan cannot be
  // confirmed Distinguished (2025-2026+). Source the rule from analytics-core
  // (undefined → submitted for pre-2025-26 historical data).
  if (!getCSPStatus(club)) return 'NotDistinguished'

  const renewals = club.aprilRenewals ?? 0
  const base = club.membershipBase ?? 0
  const trend = club.dcpGoalsTrend
  const lastEntry = trend.length > 0 ? trend[trend.length - 1] : undefined
  const goals = lastEntry?.goalsAchieved ?? 0
  const netGrowth = renewals - base

  if (goals >= 10 && renewals >= 25) return 'Smedley'
  if (goals >= 9 && renewals >= 20) return 'President'
  if (goals >= 7 && (renewals >= 20 || netGrowth >= 5)) return 'Select'
  if (goals >= 5 && (renewals >= 20 || netGrowth >= 3)) return 'Distinguished'
  return 'NotDistinguished'
}

/**
 * Get a human-readable description of what's needed to confirm
 * the club's current Distinguished level.
 */
export function getProvisionalTooltip(club: ClubTrend): string {
  const level = club.distinguishedLevel ?? 'NotDistinguished'
  const thresholds = LEVEL_THRESHOLDS[level]
  if (!thresholds) return ''

  const renewals = club.aprilRenewals ?? 0
  const confirmedLevel = getConfirmedLevel(club)
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
