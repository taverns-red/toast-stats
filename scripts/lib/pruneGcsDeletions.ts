/**
 * Prune GCS Deletions — Pure Functions (#1131)
 *
 * The prune workflow (`.github/workflows/data-pipeline.yml`, prune mode)
 * previously decided which GCS dirs to delete by diffing the local
 * snapshots/ listing against the GCS snapshots/ listing — and then deleted
 * BOTH `snapshots/<date>/` and `raw-csv/<date>/` for every missing date.
 * Raw-csv dirs are keyed by COLLECTION date, which differs from the
 * snapshot date for closing-period scrapes, so that loop orphaned remapped
 * raw-csv dirs forever and could delete a raw-csv dir that merely shared a
 * date with an unrelated pruned snapshot.
 *
 * These pure functions derive the deletion lists directly from the prune
 * CLI's classification output: raw-csv deletions keyed by rawCsvDate,
 * snapshot deletions keyed by snapshotDate. No GCS I/O lives here; the
 * workflow supplies the JSON and loops `gsutil rm` over the printed paths.
 */

/** One classification entry from `collector-cli prune` JSON output. */
export interface PruneClassification {
  /** Raw-csv collection date (YYYY-MM-DD) — keys raw-csv/ deletions. */
  rawCsvDate: string
  /** Derived snapshot date (YYYY-MM-DD) — keys snapshots/ deletions. */
  snapshotDate: string
  /** True when the date is retained; only non-keepers are deleted. */
  keep: boolean
  reason?: string
}

export interface PruneGcsDeletions {
  /** raw-csv/<date>/ dirs to delete, sorted unique. */
  rawCsvDates: string[]
  /** snapshots/<date>/ dirs to delete, sorted unique. */
  snapshotDates: string[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Derive the GCS deletion lists from prune classifications.
 *
 * Raw-csv deletions are keyed by rawCsvDate and snapshot deletions by
 * snapshotDate. Defensively, a snapshot date that any keeper still maps to
 * is never deleted (keep is a function of snapshotDate, so the split should
 * not occur — but deletion is irreversible, so belt and braces).
 */
export function computePruneGcsDeletions(
  classifications: PruneClassification[]
): PruneGcsDeletions {
  const nonKeepers = classifications.filter(c => !c.keep)
  const keeperSnapshots = new Set(
    classifications.filter(c => c.keep).map(c => c.snapshotDate)
  )

  const rawCsvDates = [...new Set(nonKeepers.map(c => c.rawCsvDate))].sort()
  const snapshotDates = [
    ...new Set(
      nonKeepers.map(c => c.snapshotDate).filter(d => !keeperSnapshots.has(d))
    ),
  ].sort()

  return { rawCsvDates, snapshotDates }
}

/**
 * Parse the `collector-cli prune` JSON output, failing closed: anything
 * other than well-formed classifications with strict YYYY-MM-DD dates
 * throws, so a malformed value (or a glob) can never reach `gsutil rm`.
 */
export function parsePruneOutput(json: string): PruneClassification[] {
  const parsed = JSON.parse(json) as { classifications?: unknown }

  if (!Array.isArray(parsed.classifications)) {
    throw new Error(
      'prune output has no classifications array — refusing to derive deletions (#1131)'
    )
  }

  return parsed.classifications.map((entry, i) => {
    const c = entry as Partial<PruneClassification>
    if (typeof c.rawCsvDate !== 'string' || !ISO_DATE.test(c.rawCsvDate)) {
      throw new Error(
        `classification[${i}] has invalid rawCsvDate ${JSON.stringify(c.rawCsvDate)} (#1131)`
      )
    }
    if (typeof c.snapshotDate !== 'string' || !ISO_DATE.test(c.snapshotDate)) {
      throw new Error(
        `classification[${i}] has invalid snapshotDate ${JSON.stringify(c.snapshotDate)} (#1131)`
      )
    }
    if (typeof c.keep !== 'boolean') {
      throw new Error(`classification[${i}] has invalid keep flag (#1131)`)
    }
    // All required fields proven above
    return c as PruneClassification
  })
}
