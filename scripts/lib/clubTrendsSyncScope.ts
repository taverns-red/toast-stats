/**
 * Which club-trends program years a daily run must pull (#1728, plan E2-2).
 *
 * `updateClubTrendsStore` keys the store by
 * `calculateProgramYear(snapshotDate)`, so a daily run writes into one PY
 * directory. Pulling only that directory instead of the whole store cuts the
 * download from every PY since 2016 to one or two.
 *
 * The PY comes from the discovery resolver (#1284), not the calendar: in July
 * TI keeps June's close live under the PRIOR PY until it rolls over, and the
 * closing-period remap then writes club-trends for 06-30. The set is the
 * union of
 *   - the resolver's PY,
 *   - the PY of every date the run computes (raw and snapshot date), which is
 *     what the writer keys on,
 *   - and, for any date in July, the prior PY, whatever the resolver said.
 * Missing a PY the run writes is the dangerous direction (the push would put
 * a one-point file over the accumulated one, #1111), so every rule only adds.
 *
 * With no usable resolver verdict (a manual `districts` override skips
 * discovery and reports `unknown`) the answer is `null`: pull the whole store.
 */

import {
  calculateProgramYear,
  getPriorProgramYear,
} from '../../packages/collector-cli/src/utils/CachePaths.js'

const PY_RE = /^(\d{4})-(\d{4})$/
const DATE_RE = /^\d{4}-(\d{2})-\d{2}$/

/** A consecutive `YYYY-YYYY` program-year label. */
export function isProgramYear(value: string): boolean {
  const m = PY_RE.exec(value)
  return m !== null && Number(m[2]) === Number(m[1]) + 1
}

/**
 * The sorted PY directories to pull, or `null` for the whole store.
 * Empty `dates` entries (an unset step output) are ignored; a malformed date
 * throws rather than guessing.
 */
export function clubTrendsProgramYears(
  resolvedProgramYear: string | undefined,
  dates: readonly string[]
): string[] | null {
  if (!resolvedProgramYear || !isProgramYear(resolvedProgramYear)) return null

  const years = new Set<string>([resolvedProgramYear])
  for (const date of dates) {
    if (date === '') continue
    const m = DATE_RE.exec(date)
    if (!m) throw new Error(`clubTrendsProgramYears: bad date '${date}'`)
    const py = calculateProgramYear(date)
    years.add(py)
    if (m[1] === '07') years.add(getPriorProgramYear(py))
  }
  return [...years].sort()
}
