/**
 * Prune Prod Reconciliation — Pure Functions (#1133)
 *
 * Prune deletes only from the STAGING bucket; promotion (`gsutil rsync`
 * without `-d`) never deletes from prod. After a prune, staging < prod and
 * the promotion count gate (staging dates < prod dates) blocks every
 * subsequent daily run — prod is frozen until reconciled (epic #1102 §9b
 * hazard 4).
 *
 * The reconcile plan is the prod-minus-staging diff of dated dirs per
 * deletable layer (raw-csv/, snapshots/). Staging is the source of truth:
 * promotion is additive, so any prod-only dated dir is a leftover of a
 * staging prune (this run's, or an earlier staging-only one). Computing the
 * diff — rather than replaying this run's classification — makes the same
 * mechanism serve both the same-run reconcile step and the post-hoc
 * recovery runbook (docs/runbooks/prune-prod-reconciliation.md).
 *
 * Fail-closed guards (deletion against a broken staging view must be
 * impossible):
 *   - empty staging listing for either layer → throw
 *   - staging/prod snapshot listings disjoint (wrong bucket / partial
 *     listing) → throw
 *   - any non-ISO date in any listing → throw
 *   - every output prefix re-validated by assertPruneDeletionScope (#1132)
 *
 * No GCS I/O lives here; the runner (scripts/prune-prod-reconcile.ts) reads
 * `gsutil ls` listings and the workflow loops `gsutil rm` over the printed
 * prefixes.
 */

import { assertPruneDeletionScope, ISO_DATE } from './pruneGcsDeletions.js'

/** Dated-dir listings for the two prune-deletable layers (#1132). */
export interface LayerDates {
  rawCsvDates: string[]
  snapshotDates: string[]
}

export interface ProdReconcilePlan {
  /** GCS-relative prefixes to delete from the PROD bucket, sorted unique. */
  deletePrefixes: string[]
}

function assertIsoDates(label: string, dates: string[]): void {
  const bad = dates.filter(d => !ISO_DATE.test(d))
  if (bad.length > 0) {
    throw new Error(
      `${label} listing contains non-ISO entries — refusing to plan prod deletions (#1133): ${bad.join(', ')}`
    )
  }
}

/**
 * Extract dated dir names (YYYY-MM-DD) from a `gsutil ls gs://bucket/layer/`
 * listing. Non-dated entries (manifest files, oddly named dirs) are ignored
 * — they can never become deletion prefixes.
 */
export function parseGcsDatedDirListing(listing: string): string[] {
  const dates = listing
    .split('\n')
    .map(line => {
      const m = line.trim().match(/\/(\d{4}-\d{2}-\d{2})\/$/)
      return m ? m[1] : null
    })
    .filter((d): d is string => d !== null)
  return [...new Set(dates)].sort()
}

/**
 * Plan the prod-side deletions that bring prod's deletable layers back in
 * line with staging.
 *
 * @param staging      current staging listings (post-prune in the same-run
 *                     case; live listings in the recovery case)
 * @param prod         current prod listings
 * @param pendingStagingDeletions  optional: dates this run's prune WILL
 *                     delete from staging (from the classification output).
 *                     Subtracted from staging so a dry-run can preview the
 *                     reconcile before staging is actually touched.
 */
export function planProdReconcile(options: {
  staging: LayerDates
  prod: LayerDates
  pendingStagingDeletions?: LayerDates
}): ProdReconcilePlan {
  const { staging, prod, pendingStagingDeletions } = options

  for (const [label, dates] of [
    ['staging raw-csv', staging.rawCsvDates],
    ['staging snapshots', staging.snapshotDates],
    ['prod raw-csv', prod.rawCsvDates],
    ['prod snapshots', prod.snapshotDates],
    ['pending-deletion raw-csv', pendingStagingDeletions?.rawCsvDates ?? []],
    [
      'pending-deletion snapshots',
      pendingStagingDeletions?.snapshotDates ?? [],
    ],
  ] as const) {
    assertIsoDates(label, dates)
  }

  // Fail closed on an empty staging view: with nothing to diff against,
  // "prod-only" would mean "all of prod".
  if (staging.snapshotDates.length === 0) {
    throw new Error(
      'staging snapshots listing is empty — refusing to plan prod deletions against an empty staging view (#1133)'
    )
  }
  if (staging.rawCsvDates.length === 0) {
    throw new Error(
      'staging raw-csv listing is empty — refusing to plan prod deletions against an empty staging view (#1133)'
    )
  }

  // Wrong-bucket tripwire: staging and prod snapshots always share the
  // promoted keep-set. Disjoint listings mean a mis-pointed or partial
  // listing, not a real diff. (raw-csv is exempt: promotion never syncs it,
  // so prod's raw-csv may legitimately be empty or a stale subset.)
  const stagingSnapshotSet = new Set(staging.snapshotDates)
  if (
    prod.snapshotDates.length > 0 &&
    !prod.snapshotDates.some(d => stagingSnapshotSet.has(d))
  ) {
    throw new Error(
      'staging and prod snapshot listings are disjoint — refusing to plan prod deletions (#1133): check the bucket arguments'
    )
  }

  const effectiveStaging = {
    rawCsvDates: subtract(
      staging.rawCsvDates,
      pendingStagingDeletions?.rawCsvDates ?? []
    ),
    snapshotDates: subtract(
      staging.snapshotDates,
      pendingStagingDeletions?.snapshotDates ?? []
    ),
  }

  const prodOnlyRawCsv = subtract(
    prod.rawCsvDates,
    effectiveStaging.rawCsvDates
  )
  const prodOnlySnapshots = subtract(
    prod.snapshotDates,
    effectiveStaging.snapshotDates
  )

  const deletePrefixes = [
    ...prodOnlyRawCsv.map(d => `raw-csv/${d}`),
    ...prodOnlySnapshots.map(d => `snapshots/${d}`),
  ].sort()

  // Structural scope guard (#1132): nothing outside the deletable layers
  // can ever be printed for a `gsutil rm` loop.
  assertPruneDeletionScope(deletePrefixes)

  return { deletePrefixes }
}

/** Inputs are already deduped (parseGcsDatedDirListing / computePruneGcsDeletions). */
function subtract(from: string[], remove: string[]): string[] {
  const removeSet = new Set(remove)
  return from.filter(d => !removeSet.has(d)).sort()
}
