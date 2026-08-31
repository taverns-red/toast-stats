/**
 * Sync-coverage guard for the published index builders (#1469).
 *
 * Both config/club-index.json and config/divisions-areas-index.json are built
 * from district_*.json files a workflow step syncs out of GCS. Neither builder
 * can detect a truncated sync on its own — two district files is a perfectly
 * valid input — so the number of files actually parsed must be checked against
 * the number the listing found.
 *
 * This exists because `gsutil cp -I` silently consumes only the first two of
 * its stdin source URLs and exits 0. With the step discarding stderr
 * (`2>/dev/null`) and the exit code (`|| true`), both indexes shipped covering
 * 2 of 94 districts for an unknown period, reporting success the whole time.
 */

/**
 * Returns a human-readable error when an index covers fewer source files than
 * the listing found, or null when coverage is acceptable.
 *
 * More parsed than listed is fine (a benign race with a concurrent write);
 * fewer is the bug. A listing of 0 means the caller could not count, so there
 * is nothing to check — failing closed there would break the step on a caller
 * that simply does not pass the count.
 */
export function syncCoverageError(
  listed: number,
  parsed: number
): string | null {
  if (listed <= 0) return null
  if (parsed >= listed) return null
  return (
    `Index covers ${parsed} of ${listed} listed district files. ` +
    `The sync did not deliver every source — this is the #1469 failure mode ` +
    `(gsutil cp -I silently truncates its stdin source list and exits 0). ` +
    `Refusing to publish a partial index over a complete one.`
  )
}
