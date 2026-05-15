import type { CompetitiveAwardStandings } from '../services/cdn'

/* Per-district countdown to the next Distinguished District tier (#516).
   Folds three numeric gaps + two officer-award booleans from the
   competitive-awards JSON into a uniform shape the table cell renderer
   can consume. */

export type CountdownCell =
  | { kind: 'gap'; value: number }
  | { kind: 'met' }
  | { kind: 'boolean'; met: boolean }

export interface DistinguishedCountdown {
  netClubGrowth: CountdownCell
  paymentGrowth: CountdownCell
  distinguishedPercent: CountdownCell
  educationTraining: CountdownCell
  clubGrowth: CountdownCell
}

export function getDistinguishedCountdown(
  _districtId: string,
  _awards: CompetitiveAwardStandings | null
): DistinguishedCountdown | null {
  return null
}
