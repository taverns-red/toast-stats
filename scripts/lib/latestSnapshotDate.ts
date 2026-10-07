/**
 * Which date may `v1/latest.json` name? (#1670) — pure decision logic.
 *
 * The manifest step used to take the newest LOCAL snapshot directory. After a
 * historical run (`rescrape-historical` for 2021-2022, say) that is the
 * historical year-end, so staging `v1/latest.json` moved back to 2022-06-30
 * and every consumer of it (the frontend default, club-index,
 * divisions-areas-index) followed it back in time.
 *
 * Rule: latest never moves backwards. The candidate is the newest of
 *   - the newest local snapshot this run produced, and
 *   - the remote `v1/latest.json` value, but only while that date still
 *     exists in the bucket (a prune may legitimately have removed it).
 * With no local snapshot, the newest date in the bucket listing is used (the
 * pre-#1670 fallback, unchanged).
 *
 * No I/O here; scripts/resolve-latest-snapshot-date.ts is the runner.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/

export interface LatestSnapshotInputs {
  /** Newest local snapshot dir with JSON in it, if any. */
  localLatest?: string
  /** `latestSnapshotDate` of the remote v1/latest.json, if readable. */
  remoteLatest?: string
  /** Every snapshot date currently in the bucket. */
  bucketDates: readonly string[]
}

function maxDate(dates: Array<string | undefined>): string | undefined {
  const valid = dates.filter((d): d is string => !!d && DATE.test(d))
  valid.sort()
  return valid[valid.length - 1]
}

export function resolveLatestSnapshotDate(
  inputs: LatestSnapshotInputs
): string | undefined {
  const inBucket = new Set(inputs.bucketDates.filter(d => DATE.test(d)))
  const remote =
    inputs.remoteLatest && inBucket.has(inputs.remoteLatest)
      ? inputs.remoteLatest
      : undefined

  if (inputs.localLatest && DATE.test(inputs.localLatest)) {
    return maxDate([inputs.localLatest, remote])
  }
  return maxDate([...inBucket, remote])
}
