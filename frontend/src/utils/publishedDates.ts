import { filterDatesByProgramYear } from './programYear'
import type { ProgramYear } from './programYear'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * The dates a page may pick as its default "latest" (#3195).
 *
 * The per-district index lists a date as soon as its base snapshot is
 * promoted, but the pipeline can hold that date's report files. `v1/latest.json`
 * only moves once they are in prod, so the default stops there. When the cap
 * would leave the program year with no date at all, the full list stands:
 * a page must never open empty because of it.
 */
export function datesForDefaultSelection(
  dates: readonly SnapshotDate[],
  publishedThrough: SnapshotDate | undefined,
  programYear: ProgramYear | null
): readonly SnapshotDate[] {
  if (!publishedThrough) return dates
  const published = dates.filter(d => d <= publishedThrough)
  if (published.length === dates.length) return dates
  if (
    programYear &&
    filterDatesByProgramYear(published, programYear).length === 0
  )
    return dates
  return published
}
