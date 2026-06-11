/**
 * Prune GCS Deletions — Runner (#1131)
 *
 * Thin glue around the pure functions in ./lib/pruneGcsDeletions.js: reads
 * the `collector-cli prune` JSON output and prints one GCS-relative prefix
 * per line to stdout (`raw-csv/<rawCsvDate>` / `snapshots/<snapshotDate>`)
 * for the data-pipeline workflow to loop `gsutil rm -r` over.
 *
 * Raw-csv deletions are keyed by COLLECTION date and snapshot deletions by
 * SNAPSHOT date — the previous workflow loop keyed both by snapshot dates,
 * which orphaned remapped raw-csv dirs forever.
 *
 * All logging goes to stderr (R4); stdout carries only the deletion paths.
 * Any parse/validation failure exits non-zero so the workflow step fails
 * closed instead of deleting from a bad input.
 *
 * Usage: npx tsx scripts/prune-gcs-deletions.ts [/tmp/prune-output.json]
 */

import { readFileSync } from 'node:fs'
import {
  assertPruneDeletionScope,
  computePruneGcsDeletions,
  formatPruneLayerScopeNote,
  parsePruneOutput,
} from './lib/pruneGcsDeletions.js'

const inputPath = process.argv[2] ?? '/tmp/prune-output.json'

let json: string
try {
  json = readFileSync(inputPath, 'utf-8')
} catch (error) {
  console.error(
    `[ERROR] Cannot read prune output at ${inputPath}: ${error instanceof Error ? error.message : 'unknown error'}`
  )
  process.exit(1)
}

try {
  const classifications = parsePruneOutput(json)
  const { rawCsvDates, snapshotDates } =
    computePruneGcsDeletions(classifications)

  const paths = [
    ...rawCsvDates.map(d => `raw-csv/${d}`),
    ...snapshotDates.map(d => `snapshots/${d}`),
  ]

  // Structural scope guard (#1132): nothing outside the deletable layers can
  // ever be printed for the workflow's `gsutil rm` loop.
  assertPruneDeletionScope(paths)

  console.error(
    `[INFO] ${classifications.length} classifications → deleting ${rawCsvDates.length} raw-csv and ${snapshotDates.length} snapshot dates`
  )
  console.error(`[INFO] ${formatPruneLayerScopeNote()}`)

  for (const p of paths) console.log(p)
} catch (error) {
  console.error(
    `[ERROR] ${error instanceof Error ? error.message : 'unknown error'}`
  )
  process.exit(1)
}
