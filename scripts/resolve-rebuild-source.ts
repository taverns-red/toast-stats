/**
 * Resolve the raw-csv date a rebuild should transform (#1608) — runner.
 *
 * Usage: npx tsx scripts/resolve-rebuild-source.ts YYYY-MM-DD
 *
 * Prints the source raw-csv date on stdout (the only stdout output, R4).
 * For a month-end date that is the LAST closing-period raw for that data
 * month (read from raw-csv metadata in GCS, falling back to the committed
 * docs/month-end-closing-dates.json for metadata-less historical raws);
 * otherwise the date itself.
 * Decision logic lives in ./lib/rebuildSource.ts (unit-tested); this is
 * thin I/O glue. Exits non-zero when GCS cannot be listed, so the rebuild
 * loop skips the date instead of falling back to a possibly pre-close raw.
 *
 * Env: GCS_BUCKET (default: toast-stats-data-staging)
 */

import * as path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { ClosingDateRegistry } from '../packages/collector-cli/src/utils/ClosingDateRegistry.js'
import {
  listRawCSVDates,
  readMetadataForDates,
  RAW_CSV_DEFAULT_BUCKET,
} from './lib/gcsHelpers.js'
import {
  closingCandidateWindow,
  isLastDayOfMonth,
  resolveRebuildSourceDate,
} from './lib/rebuildSource.js'
import { retryAsync } from './lib/retry.js'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

async function main(): Promise<void> {
  const date = process.argv[2]
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    log('usage: resolve-rebuild-source.ts YYYY-MM-DD')
    process.exit(2)
  }

  if (!isLastDayOfMonth(date)) {
    process.stdout.write(`${date}\n`)
    return
  }

  const bucket = process.env.GCS_BUCKET ?? RAW_CSV_DEFAULT_BUCKET
  const storage = new Storage()
  const rawDates = await retryAsync(() => listRawCSVDates(storage, bucket), {
    attempts: 3,
    baseDelayMs: 2000,
  })
  const candidates = closingCandidateWindow(date, rawDates)
  const entries = await readMetadataForDates(storage, bucket, candidates)
  const projectRoot = path.resolve(import.meta.dirname, '..')
  const registry = (await new ClosingDateRegistry({ projectRoot }).read())
    .months
  const source = resolveRebuildSourceDate(date, entries, {
    registry,
    rawDates: candidates,
  })

  log(
    source === date
      ? `rebuild source: ${date} (no closing raw among ${candidates.length} candidates)`
      : `rebuild source: ${date} → closing raw ${source}`
  )
  process.stdout.write(`${source}\n`)
}

main().catch(err => {
  log(`resolve-rebuild-source failed: ${(err as Error).stack ?? err}`)
  process.exit(1)
})
