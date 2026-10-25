/**
 * Officer-training round windows (#2296). Stub.
 */
export interface OfficerTrainingRoundWindow {
  programYear: string
  round: 1 | 2
  start: string
  end: string
}

export interface OfficerTrainingRoundRule {
  fromProgramYear: string
  source: string
}

export const OFFICER_TRAINING_ROUND_RULES: readonly OfficerTrainingRoundRule[] =
  []

export function getOfficerTrainingRounds(
  _programYear: string
): OfficerTrainingRoundWindow[] {
  return []
}

export function officerTrainingRoundsOn(_date: string): {
  open: OfficerTrainingRoundWindow | null
  lastClosed: OfficerTrainingRoundWindow | null
  next: OfficerTrainingRoundWindow | null
} {
  return { open: null, lastClosed: null, next: null }
}

export function daysLeftInRound(
  _window: OfficerTrainingRoundWindow,
  _date: string
): number {
  return 0
}
