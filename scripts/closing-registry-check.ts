/**
 * Closing-Date Registry Freshness Check — Runner (#1128, epic #1098)
 *
 * Thin glue around the pure functions in ./lib/registryFreshness.js. Run by
 * the daily data-pipeline after the GCS upload:
 *   1. list recent raw-csv dates in the staging bucket and read their
 *      metadata.json (the same feed find-month-end-dates.ts uses),
 *   2. compare the derivable completed closing months against the committed
 *      docs/month-end-closing-dates.json,
 *   3. emit stale/fresh + alert title/body via $GITHUB_OUTPUT; the workflow
 *      files/refreshes or auto-closes the `closing-registry-stale` issue
 *      (same self-clearing shape as the promotion-held alert, #1073).
 *
 * No decision logic lives here — that is unit-tested in
 * scripts/lib/__tests__/registryFreshness.test.ts. All logging goes to
 * stderr (R4). Always exits 0 on a completed evaluation (the workflow acts
 * on the outputs, the data publish is never held hostage); a feed failure is
 * itself reported as stale (L107: "cannot tell" must alert, not pass).
 *
 * Env:
 *   GCS_BUCKET    — bucket holding raw-csv/ (default: toast-stats-data-staging)
 *   WINDOW_DAYS   — how many trailing days of raw-csv metadata to read
 *                   (default: 130 — covers ~4 closing windows)
 *   REGISTRY_PATH — registry file (default: docs/month-end-closing-dates.json)
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { Storage } from '@google-cloud/storage'
import { listRawCSVDates, readMetadataForDates } from './lib/gcsHelpers.js'
import type { RawCSVEntry } from './lib/monthEndDates.js'
import {
  evaluateRegistryFreshness,
  buildRegistryStaleTitle,
  buildRegistryStaleBody,
  type RegistryMonthEntry,
} from './lib/registryFreshness.js'

const DEFAULT_BUCKET = 'toast-stats-data-staging'
const DEFAULT_WINDOW_DAYS = 130
const DEFAULT_REGISTRY_PATH = 'docs/month-end-closing-dates.json'
const BODY_FILE = '/tmp/closing-registry-stale-body.md'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

function readRegistry(path: string): RegistryMonthEntry[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    months?: RegistryMonthEntry[]
  }
  if (!Array.isArray(parsed.months)) {
    throw new Error(`${path} has no months[] array`)
  }
  return parsed.months
}

async function fetchRecentEntries(
  bucket: string,
  windowDays: number
): Promise<RawCSVEntry[]> {
  const storage = new Storage()
  const allDates = await listRawCSVDates(storage, bucket)
  const windowDates = allDates.slice(-windowDays)
  log(
    `raw-csv: ${allDates.length} dates total, reading metadata for the last ${windowDates.length}`
  )
  return readMetadataForDates(storage, bucket, windowDates)
}

async function main(): Promise<void> {
  const bucket = process.env.GCS_BUCKET ?? DEFAULT_BUCKET
  const windowDays = Number(process.env.WINDOW_DAYS ?? DEFAULT_WINDOW_DAYS)
  const registryPath = process.env.REGISTRY_PATH ?? DEFAULT_REGISTRY_PATH

  const registryMonths = readRegistry(registryPath)
  log(`registry: ${registryMonths.length} entries in ${registryPath}`)

  let entries: RawCSVEntry[] = []
  try {
    entries = await fetchRecentEntries(bucket, windowDays)
  } catch (err) {
    // Feed failure → evaluate with an empty feed, which reports stale with
    // emptyFeed=true. The monitor must not pass when it cannot read.
    log(`GCS metadata fetch failed: ${(err as Error).message}`)
  }

  const result = evaluateRegistryFreshness(registryMonths, entries)
  log(
    `verdict: fresh=${result.fresh} checked=[${result.checkedMonths.join(', ')}] ` +
      `missing=${result.missing.length} mismatched=${result.mismatched.length} emptyFeed=${result.emptyFeed}`
  )

  emitOutput('stale', result.fresh ? 'false' : 'true')
  if (!result.fresh) {
    writeFileSync(BODY_FILE, buildRegistryStaleBody(result), 'utf8')
    emitOutput('title', buildRegistryStaleTitle(result))
    emitOutput('body_file', BODY_FILE)
  }
}

main().catch(err => {
  // Unexpected failure (e.g. unreadable registry file): report stale rather
  // than green-by-crash, then exit 0 so the publish itself is not blocked.
  log(`closing-registry-check failed: ${(err as Error).stack ?? err}`)
  writeFileSync(
    BODY_FILE,
    [
      'The closing-date registry check crashed before producing a verdict:',
      '```',
      String((err as Error).stack ?? err),
      '```',
      'Treating "cannot tell" as stale (L107). See the workflow step logs.',
    ].join('\n'),
    'utf8'
  )
  emitOutput('stale', 'true')
  emitOutput('title', '🟥 closing-date registry check crashed')
  emitOutput('body_file', BODY_FILE)
})
