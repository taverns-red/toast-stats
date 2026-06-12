/**
 * Prune Skeleton Sync — Runner (#1175)
 *
 * Thin glue around the pure functions in ./lib/pruneSkeletonSync.js. The
 * data-pipeline prune mode calls it twice:
 *
 *   1. `--print-exclude-regex` — prints the `gsutil rsync -x` pattern that
 *      overlays ONLY `<date>/metadata.json` (single source of truth; the
 *      workflow never hardcodes the regex).
 *   2. `--raw-listing <file> --snapshot-listing <file> --cache-dir <dir>` —
 *      reads the two `gsutil ls` outputs and materializes EVERY date dir
 *      locally. A metadata-less raw-csv dir must exist locally so the
 *      #1131 protection can SEE it; the rsync overlay alone would skip it.
 *
 * All logging goes to stderr (R4); stdout carries only the JSON summary
 * (or the regex). Any parse/validation failure exits non-zero so the
 * workflow fails closed instead of classifying an empty cache.
 *
 * Usage:
 *   npx tsx scripts/prune-skeleton-sync.ts --print-exclude-regex
 *   npx tsx scripts/prune-skeleton-sync.ts \
 *     --raw-listing /tmp/raw.txt --snapshot-listing /tmp/snap.txt \
 *     --cache-dir ./cache
 */

import { mkdirSync, readFileSync } from 'node:fs'
import * as path from 'node:path'
import {
  planSkeletonDirs,
  RAW_CSV_METADATA_ONLY_EXCLUDE,
} from './lib/pruneSkeletonSync.js'

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

if (process.argv.includes('--print-exclude-regex')) {
  console.log(RAW_CSV_METADATA_ONLY_EXCLUDE)
  process.exit(0)
}

const rawListingPath = argValue('--raw-listing')
const snapshotListingPath = argValue('--snapshot-listing')
const cacheDir = argValue('--cache-dir')

if (!rawListingPath || !snapshotListingPath || !cacheDir) {
  console.error(
    '[ERROR] Usage: prune-skeleton-sync.ts --raw-listing <file> --snapshot-listing <file> --cache-dir <dir> | --print-exclude-regex'
  )
  process.exit(1)
}

try {
  const plan = planSkeletonDirs(
    readFileSync(rawListingPath, 'utf-8'),
    readFileSync(snapshotListingPath, 'utf-8')
  )

  const materialize = (layer: 'raw-csv' | 'snapshots', dates: string[]) => {
    for (const date of dates) {
      mkdirSync(path.join(cacheDir, layer, date), { recursive: true })
    }
  }
  materialize('raw-csv', plan.rawCsvDates)
  materialize('snapshots', plan.snapshotDates)

  console.error(
    `[INFO] Skeleton materialized: ${plan.rawCsvDates.length} raw-csv date dirs, ${plan.snapshotDates.length} snapshot date dirs under ${cacheDir}`
  )
  console.log(
    JSON.stringify({
      rawCsvDates: plan.rawCsvDates.length,
      snapshotDates: plan.snapshotDates.length,
    })
  )
} catch (error) {
  console.error(
    `[ERROR] ${error instanceof Error ? error.message : 'unknown error'}`
  )
  process.exit(1)
}
