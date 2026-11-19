/**
 * MembershipRetentionCalculator (#1614)
 *
 * Toast Stats estimate of the President's Membership Retention Award
 * (Item 1490 Rev. 07/2026, p. 17): the top 3 districts by
 *
 *   April renewals / (October + late + March-close new + March-close charter)
 *
 * The standings run from April 1 to June 30 of a program year. Before April
 * they are empty ('not-started'). Pure and stateless.
 */

import type { DistrictRanking } from '@taverns-red/shared-contracts'

import type { CompetitiveAwardRanking } from './CompetitiveAwardsCalculator.js'
import { assignCompetitionRanks } from './competitionRanks.js'
import { parseDateFlexible } from './programYearDates.js'

export type MembershipRetentionStatus =
  'not-started' | 'in-progress' | 'final' | 'baseline-missing'

/** One ranked district, with the numbers behind its percentage. */
export interface MembershipRetentionStanding extends CompetitiveAwardRanking {
  /** April renewals */
  retained: number
  /** October + late + March-close new + March-close charter payments */
  base: number
}

export interface MembershipRetentionAward {
  status: MembershipRetentionStatus
  /** The March close the baseline came from (YYYY-03-31), inside the window */
  baselineDate?: string
  standings: MembershipRetentionStanding[]
}

/**
 * @param rankings - Rankings for the snapshot being built
 * @param logicalDate - The snapshot's logical date (YYYY-MM-DD), not its
 *   collection date: a June close is collected in July.
 */
export function calculateMembershipRetention(
  rankings: DistrictRanking[],
  logicalDate: string
): MembershipRetentionAward {
  const date = parseDateFlexible(logicalDate)
  if (!date) return { status: 'not-started', standings: [] }

  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()

  // The window is April 1 to June 30. July to March belongs to a program
  // year whose April has not come yet.
  if (month < 4 || month > 6) return { status: 'not-started', standings: [] }

  const baselineDate = `${year}-03-31`
  const isFinal = month === 6 && day === 30

  const scored: Array<{
    district: DistrictRanking
    value: number
    retained: number
    base: number
  }> = []
  for (const r of rankings) {
    // U holds clubs that belong to no district.
    if (r.districtId.toUpperCase() === 'U') continue
    const parts = [
      r.aprilPayments,
      r.octoberPayments,
      r.latePayments,
      r.marchCloseNewPayments,
      r.marchCloseCharterPayments,
    ]
    if (!parts.every(isNumber)) continue
    const [april, october, late, marchNew, marchCharter] = parts as number[]
    const base = october! + late! + marchNew! + marchCharter!
    if (base <= 0) continue
    scored.push({
      district: r,
      value: (april! / base) * 100,
      retained: april!,
      base,
    })
  }

  if (scored.length === 0) {
    return { status: 'baseline-missing', baselineDate, standings: [] }
  }

  const standings = assignCompetitionRanks(scored).map(e => ({
    districtId: e.item.district.districtId,
    districtName: e.item.district.districtName,
    region: e.item.district.region,
    rank: e.rank,
    value: e.item.value,
    isWinner: e.isWinner,
    retained: e.item.retained,
    base: e.item.base,
  }))

  return {
    status: isFinal ? 'final' : 'in-progress',
    baselineDate,
    standings,
  }
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
