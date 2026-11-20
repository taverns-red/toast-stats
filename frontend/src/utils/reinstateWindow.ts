/* #3111 — the five-period reinstate window (stub for the red commit). */

export interface WindowPeriod {
  number: number
  start: string
  end: string
  range: string
  status: 'suspended' | 'closed'
}

export const MERGE_PERIOD5_LINE = true

export function reinstateWindowPeriods(
  _lastChanceBy: string
): WindowPeriod[] | null {
  return null
}

export function reinstateWindowSummary(
  _inactivePeriod: number,
  _lastChanceBy: string
): string {
  return ''
}

export function reinstatePeriodLine(
  _row: { inactivePeriod?: number; lastChanceBy?: string },
  _opts: { mergePeriod5?: boolean } = {}
): string {
  return ''
}
