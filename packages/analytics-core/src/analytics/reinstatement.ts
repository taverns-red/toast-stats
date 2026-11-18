/**
 * Stub for the reinstatement rule (#3007). The real implementation follows
 * the red tests.
 */

export type ReinstatementInput =
  | { status: 'suspended'; suspendDate: string }
  | { status: 'closed'; lastSeen: string }

export type ReinstatementReason = string

export interface ReinstatementResult {
  eligible: boolean
  oldestPeriod: boolean
  addsToBase: boolean
  baseProgramYear: string
  reason: ReinstatementReason
}

export function classifyReinstatement(
  _input: ReinstatementInput,
  _asOf: string
): ReinstatementResult {
  return {
    eligible: false,
    oldestPeriod: false,
    addsToBase: false,
    baseProgramYear: '',
    reason: 'not_implemented',
  }
}
