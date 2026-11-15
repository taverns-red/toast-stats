/**
 * Did this run advance prod's latest snapshot date? (#2863)
 *
 * Pure decision logic for the status.taverns.red heartbeat. A manual
 * recovery dispatch may ping only when it promoted a date newer than the
 * `latestSnapshotDate` prod held before the run, so a plain rebuild of old
 * dates never reads as a fresh daily. An unknown "before" is never a ping.
 *
 * No I/O here; scripts/status-heartbeat.ts is the runner.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function promotedNewerDate(
  before: string | undefined,
  promotedDatesCsv: string | undefined
): boolean {
  const prior = (before ?? '').trim()
  if (!DATE.test(prior)) return false
  return (promotedDatesCsv ?? '')
    .split(',')
    .map(d => d.trim())
    .some(d => DATE.test(d) && d > prior)
}
