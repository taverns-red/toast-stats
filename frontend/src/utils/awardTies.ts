import type { CompetitiveAwardRanking } from '../services/cdn'

/** TI names three winners per Top-3 award but does not publish how it breaks ties (#1610). */
export const TIE_BREAK_UNPUBLISHED = "TI's tie-break isn't published"

/** Red-phase stub (#1610). */
export function tiedWinnerIds(
  _entries: readonly CompetitiveAwardRanking[]
): Set<string> {
  return new Set()
}
