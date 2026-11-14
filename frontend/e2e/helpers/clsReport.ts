/* Shared CLS reporting for the CLS smokes (#2525).
 *
 * The smokes only assert a budget, so a passing run printed nothing and a fix
 * had no before/after figure. `reportCls` prints the measured total and the top
 * shift sources on every run: one `CLS-REPORT {json}` log line (grep-able in a
 * CI log) and a Playwright `cls` annotation (shown in the HTML report). It
 * never asserts and never reads a budget.
 */

export interface ClsShiftEntry {
  t: number
  value: number
  sources: string[]
}

export interface ClsTopSource {
  value: number
  t: number
  source: string
}

export interface ClsSummary {
  total: number
  shifts: number
  top: ClsTopSource[]
}

export const CLS_REPORT_PREFIX = 'CLS-REPORT'

const DEFAULT_TOP_N = 3

/** Total plus the `topN` shift sources, ranked by the value of the shift they
 *  belong to (a layout-shift entry's value is shared by its sources). */
export function summarizeCls(
  entries: readonly ClsShiftEntry[],
  topN: number = DEFAULT_TOP_N
): ClsSummary {
  const total = Number(entries.reduce((a, e) => a + e.value, 0).toFixed(5))
  const top = entries
    .flatMap(e => e.sources.map(source => ({ value: e.value, t: e.t, source })))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN)
  return { total, shifts: entries.length, top }
}

export function formatClsReport(
  label: string,
  entries: readonly ClsShiftEntry[],
  topN: number = DEFAULT_TOP_N
): string {
  return `${CLS_REPORT_PREFIX} ${JSON.stringify({
    label,
    ...summarizeCls(entries, topN),
  })}`
}

interface AnnotatedTestInfo {
  annotations: { type: string; description?: string }[]
}

export function reportCls(
  info: AnnotatedTestInfo,
  label: string,
  entries: readonly ClsShiftEntry[],
  opts: { topN?: number; log?: (line: string) => void } = {}
): string {
  const line = formatClsReport(label, entries, opts.topN)
  const { total, top } = summarizeCls(entries, opts.topN)
  const lead = top[0] ? `; top ${top[0].source} (${top[0].value})` : ''
  info.annotations.push({
    type: 'cls',
    description: `${label}: ${total}${lead}`,
  })
  ;(opts.log ?? console.log)(line)
  return line
}
