/** Number and growth formatting shared by the landing rankings table and its
 *  phone view, so the two never drift (#2689). */

import { signedPercent } from './displayFormat'

export const formatNumber = (num: number): string => num.toLocaleString()

export const formatPercentage = (
  percent: number
): { text: string; color: string } => {
  const text = signedPercent(percent)
  // Colour follows what is shown: a value that displays as zero is neutral.
  if (text === '0.0%') return { text, color: 'text-gray-600' }
  if (percent > 0) return { text, color: 'text-green-600' }
  return { text, color: 'text-red-600' }
}

/**
 * Rank badge (#1363, #2689). The circle is the PODIUM's, not every row's:
 * ranks 1-3 get a 28px medal, everyone else a plain bold numeral. The medals
 * use the legacy palette only (`--tm-loyal-blue`, `--tm-true-maroon`, ink and
 * surface), never a raw yellow; the rule lives in app-shell.css, keyed on
 * `data-medal` so the tokens remap for dark mode with no component branch.
 */
const MEDAL_NAMES: Readonly<Record<number, string>> = {
  1: 'gold',
  2: 'silver',
  3: 'bronze',
}

export const medalOf = (rank: number): string | undefined => MEDAL_NAMES[rank]

export const rankBadgeClassName = (rank: number): string =>
  medalOf(rank) ? 'rank-badge rank-badge--medal' : 'rank-badge'
