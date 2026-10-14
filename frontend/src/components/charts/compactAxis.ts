/* Phone x axis (#1835, mobile epic #1827 Phase 1 item 13).

   Desktop charts angle their 12 px date ticks at −45° so a dozen fit; the
   rotation costs 80 px of a 400 px plot and is unreadable on a phone. Below
   768 a chart's x axis instead shows 3–4 horizontal ticks, first and last
   kept. The ticks are chosen here, not left to Recharts' collision pass, so
   the count is the same at every width and in both engines. */

/** Ticks on a phone x axis. */
export const COMPACT_TICK_COUNT = 4

/** Up to `COMPACT_TICK_COUNT` evenly spaced values, first and last kept. */
export function compactTicks<T>(values: readonly T[]): T[] {
  const unique = [...new Set(values)]
  const n = unique.length
  if (n <= COMPACT_TICK_COUNT) return unique
  const picks = Array.from({ length: COMPACT_TICK_COUNT }, (_, i) =>
    Math.round((i * (n - 1)) / (COMPACT_TICK_COUNT - 1))
  )
  return picks.map(i => unique[i]!)
}

/** The XAxis layout props a chart spreads (after its own). */
export interface DateAxisLayout {
  angle: number
  textAnchor: 'end' | 'middle'
  height: number
  interval: number | 'preserveStartEnd'
  ticks?: Array<string | number>
}

/**
 * `compact` (below 768): horizontal labels, four chosen ticks,
 * `preserveStartEnd`. Otherwise the desktop's rotated labels and the
 * chart's own interval.
 */
export function dateAxisLayout(
  compact: boolean,
  values: ReadonlyArray<string | number>,
  desktopInterval: number | 'preserveStartEnd' = 'preserveStartEnd'
): DateAxisLayout {
  if (!compact) {
    return {
      angle: -45,
      textAnchor: 'end',
      height: 80,
      interval: desktopInterval,
    }
  }
  return {
    angle: 0,
    textAnchor: 'middle',
    height: 30,
    interval: 'preserveStartEnd',
    ticks: compactTicks(values),
  }
}
