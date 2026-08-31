/**
 * Closing-Date Registry Freshness Check — Runner (#1128, epic #1098)
 *
 * Thin glue around the pure functions in ./lib/registryFreshness.js. Run by
 * the daily data-pipeline after the GCS upload:
 *   1. read the recent raw-csv metadata window from the staging bucket (the
 *      same feed scripts/update-closing-date-registry.ts derives from),
 *   2. compare the derivable completed closing months against the committed
 *      docs/month-end-closing-dates.json (read via ClosingDateRegistry, the
 *      file's single owner),
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
 *   GCS_BUCKET  — bucket holding raw-csv/ (default: toast-stats-data-staging)
 *   WINDOW_DAYS — how many trailing raw-csv date dirs to read (default: 130,
 *                 ~4 closing windows)
 */

import { appendFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { ClosingDateRegistry } from '../packages/collector-cli/src/utils/ClosingDateRegistry.js'
import {
  readRecentRawCSVEntries,
  RAW_CSV_DEFAULT_BUCKET,
  RAW_CSV_DEFAULT_WINDOW,
} from './lib/gcsHelpers.js'
import type { RawCSVEntry } from './lib/monthEndDates.js'
import {
  evaluateRegistryFreshness,
  buildRegistryStaleTitle,
  buildRegistryStaleBody,
  classifyRegistryRemediation,
} from './lib/registryFreshness.js'
import { retryAsync } from './lib/retry.js'

const BODY_FILE = '/tmp/closing-registry-stale-body.md'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

async function main(): Promise<void> {
  const bucket = process.env.GCS_BUCKET ?? RAW_CSV_DEFAULT_BUCKET
  const windowDays = Number(process.env.WINDOW_DAYS ?? RAW_CSV_DEFAULT_WINDOW)
  const projectRoot = path.resolve(import.meta.dirname, '..')

  // ClosingDateRegistry owns the file's path + shape. A missing/corrupt file
  // reads as an empty registry, which the evaluation reports as missing
  // months — the informative alert, not a silent pass.
  const registry = new ClosingDateRegistry({ projectRoot })
  const registryMonths = (await registry.read()).months
  log(`registry: ${registryMonths.length} committed entries`)

  const storage = new Storage()
  let entries: RawCSVEntry[] = []
  try {
    // The GCS read can throw on a TRANSIENT WIF/STS token exchange
    // (`sts.googleapis.com/v1/token: Premature close`, #1245). Retry with
    // bounded backoff so a single flaky token fetch no longer fires a false
    // empty-feed STALE alert. If it still fails after the attempts are spent
    // the catch below leaves entries empty → emptyFeed=true → stale: the
    // monitor must not pass when it genuinely cannot read (fail-closed, L107).
    entries = await retryAsync(
      () => readRecentRawCSVEntries(storage, bucket, windowDays, log),
      {
        attempts: 3,
        baseDelayMs: 2000,
        onRetry: (err, attempt, delayMs) =>
          log(
            `GCS metadata read attempt ${attempt} failed (${(err as Error).message}); ` +
              `retrying in ${delayMs}ms`
          ),
      }
    )
  } catch (err) {
    // Persistent feed failure → evaluate with an empty feed, which reports
    // stale with emptyFeed=true. The monitor must not pass when it cannot read.
    log(`GCS metadata fetch failed after retries: ${(err as Error).message}`)
  }

  const result = evaluateRegistryFreshness(registryMonths, entries)
  const remediation = classifyRegistryRemediation(result)
  log(
    `verdict: fresh=${result.fresh} checked=[${result.checkedMonths.join(', ')}] ` +
      `missing=${result.missing.length} mismatched=${result.mismatched.length} ` +
      `emptyFeed=${result.emptyFeed} remediation=${remediation}`
  )

  emitOutput('stale', result.fresh ? 'false' : 'true')

  // `remediation` is what the workflow branches on (#1419). `stale` is kept
  // for the unchanged auto-close step (and any other consumer): a fresh
  // verdict still closes the open alert.
  //
  //   auto   → the derivation proved the entries; the pipeline opens the
  //            registry PR itself. Filing a red issue for work the machine
  //            just did is what made #1419 re-fire daily for 19 days.
  //   manual → the monitor is blind or crashed. File/refresh the red issue
  //            exactly as before — fail-closed is untouched (L107).
  emitOutput('remediation', remediation)

  if (!result.fresh) {
    writeFileSync(BODY_FILE, buildRegistryStaleBody(result), 'utf8')
    emitOutput('title', buildRegistryStaleTitle(result))
    emitOutput('body_file', BODY_FILE)
  }
}

main().catch(err => {
  // Unexpected failure: report stale rather than green-by-crash, then exit 0
  // so the publish itself is not blocked.
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
  // A crash is never auto-remediable — there is no derivation to trust.
  emitOutput('remediation', 'manual')
  emitOutput('title', '🟥 closing-date registry check crashed')
  emitOutput('body_file', BODY_FILE)
})
