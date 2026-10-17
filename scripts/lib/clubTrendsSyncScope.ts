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
 *
 * A rebuild has no resolver verdict but names the dates it computes (#2102):
 * `clubTrendsProgramYearsForDates` is the same union without the resolver's
 * PY. A rebuild date the transform remaps writes the previous month-end
 * (a closing raw, #193), which leaves the PY only from July to 06-30, and
 * the July rule carries the prior PY. publish-stores.sh refuses any PY the
 * sync did not pull, so a miss fails the run instead of clobbering a PY.
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
  return [...addDateYears(new Set([resolvedProgramYear]), dates)].sort()
}

/**
 * The sorted PY directories a run over `dates` writes (#2102), or `null`
 * for the whole store when no date is named (a rebuild of every raw date).
 */
export function clubTrendsProgramYearsForDates(
  dates: readonly string[]
): string[] | null {
  const years = addDateYears(new Set<string>(), dates)
  return years.size === 0 ? null : [...years].sort()
}

/** Each date's PY, plus the prior PY for a July date, added to `years`. */
function addDateYears(
  years: Set<string>,
  dates: readonly string[]
): Set<string> {
  for (const date of dates) {
    if (date === '') continue
    const m = DATE_RE.exec(date)
    if (!m) throw new Error(`clubTrendsProgramYears: bad date '${date}'`)
    const py = calculateProgramYear(date)
    years.add(py)
    if (m[1] === '07') years.add(getPriorProgramYear(py))
  }
  return years
}
