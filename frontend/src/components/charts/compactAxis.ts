/* Stub (#1835): see the test. */
export const COMPACT_TICK_COUNT = 4

export function compactTicks<T>(values: readonly T[]): T[] {
  return [...values]
}

export interface DateAxisLayout {
  angle: number
  textAnchor: 'end' | 'middle'
  height: number
  interval: number | 'preserveStartEnd'
  ticks?: Array<string | number>
}

export function dateAxisLayout(
  _compact: boolean,
  _values: ReadonlyArray<string | number>,
  desktopInterval: number | 'preserveStartEnd' = 'preserveStartEnd'
): DateAxisLayout {
  return {
    angle: -45,
    textAnchor: 'end',
    height: 80,
    interval: desktopInterval,
  }
}
