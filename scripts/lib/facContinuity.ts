/**
 * Find-A-Club continuity check for the completeness gate (#2239 AC3).
 *
 * RED STUB: the signatures only. The implementation lands in the next commit.
 */

import type { DateRegression } from './dateCompletenessGate.js'

export const FAC_ENRICHED_SINCE = '2026-05-15'
export const FAC_KNOWN_UNENRICHED_DATES: ReadonlySet<string> = new Set()
export const FAC_BASELINE_DATES = 3
export const FAC_DROP_SHARE = 0.1
export const FAC_MIN_CLUBS_LOST = 3
export const FAC_FLOOR_MIN_MERGED_SHARE = 0.5

export interface FacCoverage {
  clubs: number
  merged: boolean
  coordinates: number
  address: number
  meeting: number
}

export interface FacBaseline {
  date: string
  coverage: FacCoverage | null
}

export function facCoverage(_value: unknown): FacCoverage | null {
  return null
}

export function facCheckApplies(_date: string): boolean {
  return false
}

export function facBaselineDates(
  _prodDates: readonly string[],
  _date: string,
  _count: number = FAC_BASELINE_DATES
): string[] {
  return []
}

export function compareFacContinuity(
  _date: string,
  _staging: Readonly<Record<string, FacCoverage | null>>,
  _baselines: Readonly<Record<string, readonly FacBaseline[]>>
): DateRegression[] {
  return []
}
