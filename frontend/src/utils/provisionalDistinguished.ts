/**
 * Client-side provisional Distinguished detection (#291).
 *
 * Derives whether a Distinguished club's status is provisional
 * from existing CDN fields, avoiding pipeline dependency.
 *
 * Business rule:
 * - Pre-April data (Jul-Mar): membership count includes non-renewers.
 *   Only aprilRenewals are confirmed. If aprilRenewals alone don't
 *   qualify the club (>= 20 members OR net growth >= 3), status
 *   is provisional.
 * - Post-April data (Apr-Jun): membership count reflects reality.
 *   All Distinguished = confirmed.
 */

import type { ClubTrend } from '../hooks/useDistrictAnalytics'

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

  // Pre-April: check if aprilRenewals alone qualify
  const renewals = club.aprilRenewals ?? 0
  const base = club.membershipBase ?? 0
  const confirmedNetGrowth = renewals - base

  return renewals < 20 && confirmedNetGrowth < 3
}
