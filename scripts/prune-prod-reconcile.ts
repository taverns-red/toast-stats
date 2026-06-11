/**
 * Prune Prod Reconciliation — Runner (#1133)
 *
 * Thin glue around the pure functions in ./lib/pruneProdReconcile.js:
 * reads `gsutil ls` listings of both buckets' deletable layers (and
 * optionally this run's `collector-cli prune` output, whose pending
 * deletions are treated as already gone from staging — the dry-run
 * preview), then prints one PROD-bucket deletion prefix per line to stdout
 * for the workflow (or the operator, per the runbook) to loop
 * `gsutil rm -r` over.
 *
 * All logging goes to stderr (R4); stdout carries only the deletion paths.
 * Any parse/validation failure exits non-zero so the caller fails closed
 * instead of deleting from a bad input.
 *
 * Usage:
 *   npx tsx scripts/prune-prod-reconcile.ts \
 *     --staging-snapshots <file> --staging-rawcsv <file> \
 *     --prod-snapshots <file> --prod-rawcsv <file> \
 *     [--prune-output /tmp/prune-output.json] \
 *     [--max-deletion-fraction 0.5]
 */

import { readFileSync } from 'node:fs'
import {
  parseGcsDatedDirListing,
  planProdReconcile,
  type LayerDates,
} from './lib/pruneProdReconcile.js'
import {
  computePruneGcsDeletions,
  parsePruneOutput,
} from './lib/pruneGcsDeletions.js'

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`malformed arguments near ${JSON.stringify(flag)}`)
    }
    args.set(flag.slice(2), value)
  }
  return args
}

function readListing(args: Map<string, string>, flag: string): string[] {
  const file = args.get(flag)
  if (!file) {
    throw new Error(`missing required --${flag} <file> argument`)
  }
  return parseGcsDatedDirListing(readFileSync(file, 'utf-8'))
}

try {
  const args = parseArgs(process.argv.slice(2))

  const staging: LayerDates = {
    rawCsvDates: readListing(args, 'staging-rawcsv'),
    snapshotDates: readListing(args, 'staging-snapshots'),
  }
  const prod: LayerDates = {
    rawCsvDates: readListing(args, 'prod-rawcsv'),
    snapshotDates: readListing(args, 'prod-snapshots'),
  }

  let pendingStagingDeletions: LayerDates | undefined
  const pruneOutputPath = args.get('prune-output')
  if (pruneOutputPath) {
    const classifications = parsePruneOutput(
      readFileSync(pruneOutputPath, 'utf-8')
    )
    const pending = computePruneGcsDeletions(classifications)
    pendingStagingDeletions = {
      rawCsvDates: pending.rawCsvDates,
      snapshotDates: pending.snapshotDates,
    }
    console.error(
      `[INFO] prune output: ${pending.rawCsvDates.length} raw-csv and ` +
        `${pending.snapshotDates.length} snapshot dates pending staging deletion`
    )
  }

  let maxDeletionFraction: number | undefined
  const rawFraction = args.get('max-deletion-fraction')
  if (rawFraction !== undefined) {
    maxDeletionFraction = Number(rawFraction)
    if (
      !Number.isFinite(maxDeletionFraction) ||
      maxDeletionFraction <= 0 ||
      maxDeletionFraction > 1
    ) {
      throw new Error(
        `--max-deletion-fraction must be in (0, 1], got '${rawFraction}'`
      )
    }
  }

  const plan = planProdReconcile({
    staging,
    prod,
    pendingStagingDeletions,
    maxDeletionFraction,
  })

  console.error(
    `[INFO] staging: ${staging.rawCsvDates.length} raw-csv / ${staging.snapshotDates.length} snapshot dates; ` +
      `prod: ${prod.rawCsvDates.length} raw-csv / ${prod.snapshotDates.length} snapshot dates`
  )
  console.error(
    `[INFO] prod-reconcile plan: ${plan.deletePrefixes.length} prod-only prefixes to delete`
  )

  for (const p of plan.deletePrefixes) console.log(p)
} catch (error) {
  console.error(
    `[ERROR] ${error instanceof Error ? error.message : 'unknown error'}`
  )
  process.exit(1)
}
