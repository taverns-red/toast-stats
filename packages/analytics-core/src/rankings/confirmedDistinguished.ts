/**
 * Confirmed-Distinguished count for the district rankings (#304, #2221).
 *
 * Rule: before TI recognises Distinguished clubs every district reports 0,
 * so the rankings count the clubs whose APRIL RENEWALS ALONE meet the
 * membership requirement of some Distinguished Club Program rung (#296,
 * `getConfirmedDistinguishedLevel`): DCP goals met (5 / 7 / 9 / 10) plus
 * 20 members, or net growth over the membership base (+3 Distinguished,
 * +5 Select), with the renewals standing in for the membership count.
 *
 * The renewal COUNT is district-performance.csv "Apr. Ren." (the same field
 * `DataTransformer` stores as `aprilRenewals`). club-performance.csv
 * "Mem. dues on time Apr" is NOT a count: it is TI's 0/1 per-club flag for
 * the April dues deadline (`regionRollups` reads it as a flag). Reading the
 * flag as the count made every club 1 member strong, so no club could ever
 * be confirmed (#2221).
 */

import { normalizeClubId } from '@taverns-red/shared-contracts'
import { getConfirmedDistinguishedLevel } from '../analytics/ClubEligibilityUtils.js'

type CsvRow = Record<string, string | number | null | undefined>

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0
  const n = Number.parseInt(value.replace(/,/g, '').trim(), 10)
  return Number.isNaN(n) ? 0 : n
}

/**
 * April renewal counts keyed by canonical club id, from per-club
 * district-performance rows. Rows without a `Club` column (e.g. an
 * all-districts summary row) are ignored.
 */
export function aprilRenewalsByClub(
  districtPerformance: readonly CsvRow[]
): Map<string, number> {
  const byClub = new Map<string, number>()
  for (const row of districtPerformance) {
    const clubId = normalizeClubId(row['Club'])
    if (!clubId) continue
    byClub.set(clubId, toNumber(row['Apr. Ren.'] ?? row['Apr. Ren']))
  }
  return byClub
}

/**
 * Count the clubs whose confirmed Distinguished level (April renewals as the
 * membership count) is not NotDistinguished. A club with no district-
 * performance row has no known renewals and is not counted.
 *
 * @param clubPerformance - club-performance.csv rows ("Club Number",
 *   "Goals Met", "Mem. Base")
 * @param districtPerformance - district-performance.csv rows ("Club",
 *   "Apr. Ren.")
 * @param programYear - "YYYY-YYYY", so a rung that did not exist that year
 *   is not used (#1406). Omitted → current rules.
 */
export function countConfirmedDistinguishedClubs(
  clubPerformance: readonly CsvRow[],
  districtPerformance: readonly CsvRow[],
  programYear?: string
): number {
  const renewals = aprilRenewalsByClub(districtPerformance)
  let count = 0
  for (const club of clubPerformance) {
    const clubId = normalizeClubId(club['Club Number'])
    if (!clubId) continue
    const aprilRenewals = renewals.get(clubId)
    if (aprilRenewals === undefined) continue
    const level = getConfirmedDistinguishedLevel(
      toNumber(club['Goals Met']),
      aprilRenewals,
      toNumber(club['Mem. Base']),
      programYear
    )
    if (level !== 'NotDistinguished') count++
  }
  return count
}
