/**
 * Prune Skeleton Sync — Pure Functions (#1175)
 *
 * The prune workflow previously full-content-rsynced raw-csv/ AND
 * snapshots/ before classifying; post-#1147 the bucket no longer fits a
 * GitHub runner's disk (run 27393189818 died: No space left on device).
 * Classification (PruneService) reads only the raw-csv date-dir SET and
 * each date's metadata.json — so the sync becomes a skeleton:
 *
 *   1. `gsutil ls` the raw-csv/ and snapshots/ prefixes
 *   2. materialize ALL date dirs locally (a metadata-less dir must stay
 *      VISIBLE — the #1131 fail-closed protection works by SEEING a
 *      raw-csv date dir without metadata.json; a metadata-only sync that
 *      skipped those dirs would make protected dates invisible instead
 *      of protected)
 *   3. overlay metadata.json files via `gsutil -m rsync -r -x <exclude>`
 *
 * No GCS I/O lives here; scripts/prune-skeleton-sync.ts is the runner
 * glue and the workflow supplies the listings.
 */

/** Matches one `gsutil ls` prefix line, capturing a date-dir name. */
const DATE_PREFIX = /\/(\d{4}-\d{2}-\d{2})\/\s*$/

/**
 * Extract the date-dir names from a `gsutil ls gs://bucket/<layer>/`
 * listing. Non-date prefixes, bare files at the layer root, blank lines
 * and duplicates are ignored. Sorted ascending.
 */
export function datesFromGcsListing(lines: string[]): string[] {
  const dates = new Set<string>()
  for (const line of lines) {
    const match = DATE_PREFIX.exec(line.trim())
    if (match?.[1]) dates.add(match[1])
  }
  return [...dates].sort()
}

/** Date-dir sets the skeleton sync must materialize locally. */
export interface SkeletonDirPlan {
  rawCsvDates: string[]
  snapshotDates: string[]
}

/**
 * Plan the local skeleton from the two `gsutil ls` listings.
 *
 * Fails closed when the raw-csv listing parses to zero date dirs: the
 * staging bucket is never legitimately empty, so an empty listing means
 * the `gsutil ls` itself failed (wrong bucket, auth, transient error) —
 * and proceeding would classify nothing while reporting success.
 * An empty snapshots listing is tolerated: snapshots are not a
 * classification input (PruneService reads only raw-csv).
 */
export function planSkeletonDirs(
  rawCsvListing: string[],
  snapshotListing: string[]
): SkeletonDirPlan {
  const rawCsvDates = datesFromGcsListing(rawCsvListing)
  if (rawCsvDates.length === 0) {
    throw new Error(
      'prune skeleton sync (#1175): raw-csv listing parsed to zero date dirs — ' +
        'refusing to proceed; an empty listing on a populated bucket means the ' +
        '`gsutil ls` failed, and classifying an empty cache would silently prune nothing'
    )
  }
  return {
    rawCsvDates,
    snapshotDates: datesFromGcsListing(snapshotListing),
  }
}

/**
 * `gsutil rsync -x` exclusion regex (Python `re` syntax) that keeps ONLY
 * `<date>/metadata.json` when overlaying gs://bucket/raw-csv/ onto the
 * local skeleton.
 *
 * gsutil matches the pattern against paths RELATIVE to the source URL,
 * and a pattern that matches a DIRECTORY path excludes the whole
 * directory from traversal — so the bare `<date>` path must also be kept
 * (not matched), or the metadata.json inside is never even compared.
 */
export const RAW_CSV_METADATA_ONLY_EXCLUDE =
  '^(?!\\d{4}-\\d{2}-\\d{2}(/metadata\\.json)?$).*'
