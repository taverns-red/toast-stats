/**
 * Standard competition ranking, shared by the competitive award calculators.
 *
 * Sorts by value descending, gives tied values the same rank and skips the
 * ranks that follow (1, 2, 2, 4). The top N ranks are winners, if they meet
 * the optional threshold.
 */

/** Number of top districts that earn each competitive award */
export const TOP_N_WINNERS = 3

export interface CompetitionRanked<T> {
  item: T
  rank: number
  isWinner: boolean
}

export function assignCompetitionRanks<T extends { value: number }>(
  scored: T[],
  winnerThreshold?: number
): Array<CompetitionRanked<T>> {
  const sorted = [...scored].sort((a, b) => b.value - a.value)

  const result: Array<CompetitionRanked<T>> = []
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
    result.push({
      item: entry,
      rank,
      isWinner: rank <= TOP_N_WINNERS && meetsThreshold,
    })
  }

  return result
}
