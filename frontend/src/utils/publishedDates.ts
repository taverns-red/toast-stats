import type { SnapshotDate } from '../types/snapshotDate'

/**
 * The dates a page may default to: those up to `v1/latest.json` (#3195).
 * The index lists a date once its snapshot is promoted, but the pipeline can
 * hold its reports. Without a manifest date, or if the cap would leave
 * nothing, the list is returned whole. Tested in publishedDates.test.ts.
 */
export function capDatesAtPublished(
  dates: SnapshotDate[],
  publishedThrough: SnapshotDate | undefined
): SnapshotDate[] {
  if (!publishedThrough) return dates
  const published = dates.filter(d => d <= publishedThrough)
  return published.length === 0 || published.length === dates.length
    ? dates
    : published
}
