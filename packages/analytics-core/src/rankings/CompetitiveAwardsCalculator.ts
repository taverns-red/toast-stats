/**
 * CompetitiveAwardsCalculator (#330)
 *
 * Computes the three competitive district awards from the Distinguished
 * District Program (Item 1490). Each award names the top 3 districts
 * worldwide in a specific category:
 *
 * - **President's Extension Award** — Top 3 by net club growth
 * - **President's 20-Plus Award** — Top 3 by % of clubs with 20+ paid members
 * - **District Club Retention Award** — Top 3 retaining ≥90% of paid clubs
 *
 * Operates on already-ranked DistrictRanking[] data. Stateless and pure.
 */

import type { DistrictRanking } from '@toastmasters/shared-contracts'

/**
 * Single ranked entry in a competitive award leaderboard.
 */
export interface CompetitiveAwardRanking {
  /** District identifier (e.g., "61") */
  districtId: string
  /** Display name (e.g., "District 61") */
  districtName: string
  /** Geographic region */
  region: string
  /** Standard competition rank within this award (1 = best, ties share rank) */
  rank: number
  /** The metric value used for ranking */
  value: number
  /** Whether this district qualifies as a winner (top 3 + any thresholds) */
  isWinner: boolean
}

/**
 * Per-district lookup of competitive award standings, keyed by districtId.
 * Lets the frontend show "Ranked #X for [award]" badges without iterating
 * the full leaderboards.
 */
export interface CompetitiveAwardsByDistrict {
  extensionRank: number
  extensionValue: number
  extensionIsWinner: boolean
  twentyPlusRank: number
  twentyPlusValue: number
  twentyPlusIsWinner: boolean
  retentionRank: number
  retentionValue: number
  retentionIsWinner: boolean
}

/**
 * Complete competitive awards standings for a snapshot.
 */
export interface CompetitiveAwardStandings {
  /** Top-ranked districts for President's Extension Award (sorted, all districts) */
  extensionAward: CompetitiveAwardRanking[]
  /** Top-ranked districts for President's 20-Plus Award (sorted, all districts) */
  twentyPlusAward: CompetitiveAwardRanking[]
  /** Top-ranked districts for District Club Retention Award (sorted, all districts) */
  retentionAward: CompetitiveAwardRanking[]
  /** Per-district summary for fast lookup */
  byDistrict: Record<string, CompetitiveAwardsByDistrict>
}

/** Minimum retention % to qualify as a winner of the Retention Award */
const RETENTION_WINNER_THRESHOLD = 90

/** Number of top districts that earn each competitive award */
const TOP_N_WINNERS = 3

/**
 * Compute competitive award standings from already-ranked districts.
 */
export class CompetitiveAwardsCalculator {
  /**
   * Calculate all three competitive award standings.
   *
   * @param rankings - Array of district rankings from BordaCountRankingCalculator
   * @returns Complete competitive award standings
   */
  calculate(rankings: DistrictRanking[]): CompetitiveAwardStandings {
    const extensionAward = this.rankByExtension(rankings)
    const twentyPlusAward = this.rankByTwentyPlus(rankings)
    const retentionAward = this.rankByRetention(rankings)

    const byDistrict: Record<string, CompetitiveAwardsByDistrict> = {}
    for (const district of rankings) {
      const ext = extensionAward.find(r => r.districtId === district.districtId)
      const tp = twentyPlusAward.find(r => r.districtId === district.districtId)
      const ret = retentionAward.find(r => r.districtId === district.districtId)

      byDistrict[district.districtId] = {
        extensionRank: ext?.rank ?? 0,
        extensionValue: ext?.value ?? 0,
        extensionIsWinner: ext?.isWinner ?? false,
        twentyPlusRank: tp?.rank ?? 0,
        twentyPlusValue: tp?.value ?? 0,
        twentyPlusIsWinner: tp?.isWinner ?? false,
        retentionRank: ret?.rank ?? 0,
        retentionValue: ret?.value ?? 0,
        retentionIsWinner: ret?.isWinner ?? false,
      }
    }

    return {
      extensionAward,
      twentyPlusAward,
      retentionAward,
      byDistrict,
    }
  }

  /**
   * President's Extension Award — top 3 by net club growth.
   * Net growth = paidClubs - paidClubBase
   */
  private rankByExtension(
    rankings: DistrictRanking[]
  ): CompetitiveAwardRanking[] {
    const scored = rankings.map(r => ({
      district: r,
      value: r.paidClubs - r.paidClubBase,
    }))
    return this.assignRanks(scored)
  }

  /**
   * President's 20-Plus Award — top 3 by % clubs with 20+ paid members.
   */
  private rankByTwentyPlus(
    rankings: DistrictRanking[]
  ): CompetitiveAwardRanking[] {
    const scored = rankings.map(r => {
      const twentyPlus = r.clubsWith20PlusMembers ?? 0
      const value = r.activeClubs > 0 ? (twentyPlus / r.activeClubs) * 100 : 0
      return { district: r, value }
    })
    return this.assignRanks(scored)
  }

  /**
   * District Club Retention Award — top 3 retaining ≥90% paid clubs.
   *
   * Retention % = (paidClubs − newCharteredClubs) / paidClubBase * 100
   *
   * Subtracting newly chartered clubs is what distinguishes this from the
   * Extension Award (#336). Without that subtraction the formula collapses to
   * `1 + netGrowth / paidClubBase`, producing identical rankings to Extension.
   *
   * Falls back to the legacy `paidClubs / paidClubBase` formula when
   * `newCharteredClubs` is missing (older snapshots predating #336).
   * Districts below 90% threshold cannot win even if they're in the top 3.
   */
  private rankByRetention(
    rankings: DistrictRanking[]
  ): CompetitiveAwardRanking[] {
    const scored = rankings.map(r => {
      if (r.paidClubBase <= 0) return { district: r, value: 0 }
      const retainedBase =
        r.newCharteredClubs !== undefined
          ? r.paidClubs - r.newCharteredClubs
          : r.paidClubs
      const value = (retainedBase / r.paidClubBase) * 100
      return { district: r, value }
    })
    return this.assignRanks(scored, RETENTION_WINNER_THRESHOLD)
  }

  /**
   * Sort by value descending and assign standard competition ranks.
   * Marks the top N districts as winners (if they meet any threshold).
   *
   * @param scored - Array of {district, value} pairs to rank
   * @param winnerThreshold - Minimum value to qualify as a winner (default: no threshold)
   */
  private assignRanks(
    scored: Array<{ district: DistrictRanking; value: number }>,
    winnerThreshold?: number
  ): CompetitiveAwardRanking[] {
    // Sort by value descending
    const sorted = [...scored].sort((a, b) => b.value - a.value)

    // Assign standard competition ranks (ties share rank, next rank skips)
    const result: CompetitiveAwardRanking[] = []
    let lastValue: number | null = null
    let lastRank = 0

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i]
      if (!entry) continue

      const rank = entry.value === lastValue ? lastRank : i + 1
      lastValue = entry.value
      lastRank = rank

      const meetsThreshold =
        winnerThreshold === undefined || entry.value >= winnerThreshold
      const isWinner = rank <= TOP_N_WINNERS && meetsThreshold

      result.push({
        districtId: entry.district.districtId,
        districtName: entry.district.districtName,
        region: entry.district.region,
        rank,
        value: entry.value,
        isWinner,
      })
    }

    return result
  }
}
