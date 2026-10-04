import type { CompetitiveAwardRanking } from '../services/cdn'

/**
 * TI names three winners per Top-3 award (Item 1490) but does not publish how
 * it breaks ties (#1610). Toast Stats keeps tied districts at a shared rank
 * and labels them, rather than inventing a secondary sort key.
 */
export const TIE_BREAK_UNPUBLISHED = "TI's tie-break isn't published"

/**
 * Ids of winners that share their rank with another district. The calculator
 * uses standard competition ranking, so a shared rank means an exact tie on
 * the award metric — and a tie at or across 3rd place yields co-winners.
 */
export function tiedWinnerIds(
  entries: readonly CompetitiveAwardRanking[]
): Set<string> {
  const countByRank = new Map<number, number>()
  for (const e of entries) {
    countByRank.set(e.rank, (countByRank.get(e.rank) ?? 0) + 1)
  }
  return new Set(
    entries
      .filter(e => e.isWinner && (countByRank.get(e.rank) ?? 0) > 1)
      .map(e => e.districtId)
  )
}
