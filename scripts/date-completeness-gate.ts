/**
 * Per-date completeness gate — Runner (#1761, ADR-015 P5.2, step 3)
 *
 * Thin glue around ./lib/dateCompletenessGate.js, run on the CI runner just
 * before `Promote run manifest to production`: for every date this run touched,
 * compare staging's snapshot directory with production's and HOLD (D8) on
 * any regression unless allow_value_changes. Nothing is written to any
 * bucket.
 *
 * Touched dates: the snapshot dates in the run manifest (RUN_MANIFEST_FILE,
 * #1762, ADR-015 P5) — every `snapshots/<date>/` object this run uploaded,
 * whichever stage wrote it. Missing, empty or malformed fails closed.
 *
 * Env: GCS_BUCKET (staging), GCS_BUCKET_PRODUCTION, ALLOW_VALUE_CHANGES,
 *      RUN_MANIFEST_FILE,
 *      COMPLETENESS_GATE_FILE (default /tmp/completeness-gate.json),
 *      FAC_WARNING_BODY_FILE (default /tmp/fac-loss-warning.md): the
 *      `fac-loss` issue body, written when Find-A-Club losses warned
 *      (#2239). Outputs: completeness_promote, fac_warnings (count).
 *
 * Always exits 0: the decision flows through `completeness_promote`, like
 * the value and content gates, so the promotion-held steps stay reachable.
 * Any error FAILS CLOSED (completeness_promote=false). Logs go to stderr (R4).
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { Storage } from '@google-cloud/storage'
import {
  buildCompletenessGateSummary,
  buildFacWarningBody,
  evaluateCompletenessGate,
  runCompletenessGate,
  type CompletenessGateResult,
} from './lib/dateCompletenessGate.js'
import { gateBucket } from './lib/gcsMedia.js'
import { manifestSnapshotDates, parseRunManifest } from './lib/runManifest.js'

const DEFAULT_RESULT_FILE = '/tmp/completeness-gate.json'
const DEFAULT_FAC_WARNING_FILE = '/tmp/fac-loss-warning.md'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

function touchedDates(): string[] {
  const file = process.env.RUN_MANIFEST_FILE
  if (!file) throw new Error('RUN_MANIFEST_FILE must be set')
  return manifestSnapshotDates(parseRunManifest(readFileSync(file, 'utf-8')))
}

async function run(
  allowValueChanges: boolean
): Promise<CompletenessGateResult> {
  const stagingName = process.env.GCS_BUCKET
  const prodName = process.env.GCS_BUCKET_PRODUCTION
  if (!stagingName || !prodName) {
    throw new Error('GCS_BUCKET and GCS_BUCKET_PRODUCTION must be set')
  }
  const dates = touchedDates()
  log(`[completeness-gate] touched dates: ${dates.join(' ') || '(none)'}`)
  const storage = new Storage()
  // Non-streaming reads: SDK file.download() logs 2 MaxListeners warnings
  // per object (#2029, see gcsMedia.ts).
  return runCompletenessGate(
    gateBucket(storage, stagingName),
    gateBucket(storage, prodName),
    dates,
    { allowValueChanges, log }
  )
}

async function main(): Promise<void> {
  const resultFile = process.env.COMPLETENESS_GATE_FILE || DEFAULT_RESULT_FILE
  const allowValueChanges = process.env.ALLOW_VALUE_CHANGES === 'true'
  const started = Date.now()
  let result: CompletenessGateResult
  try {
    result = await run(allowValueChanges)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[completeness-gate] error: ${message}`)
    result = evaluateCompletenessGate({
      dates: [],
      regressions: [],
      allowValueChanges,
      error: message,
    })
  }

  const level = result.promote ? 'warning' : 'error'
  for (const f of result.failures.slice(0, 50)) {
    log(`::${level} title=Completeness gate::${f.path}: ${f.reason}`)
  }
  for (const w of result.warnings.slice(0, 50)) {
    log(`::warning title=Find-A-Club loss (promoted)::${w.path}: ${w.reason}`)
  }
  log(
    `[completeness-gate] ${result.promote ? 'PASS' : 'HOLD'} — ${result.reason} ` +
      `(${Math.round((Date.now() - started) / 1000)}s)`
  )

  try {
    writeFileSync(resultFile, JSON.stringify(result, null, 2))
    const summaryFile = process.env.GITHUB_STEP_SUMMARY
    if (summaryFile) {
      appendFileSync(summaryFile, buildCompletenessGateSummary(result))
    }
  } catch (err) {
    log(`[completeness-gate] could not write result: ${String(err)}`)
  }
  const body = buildFacWarningBody(result)
  let warned = result.warnings.length
  if (body) {
    try {
      writeFileSync(
        process.env.FAC_WARNING_BODY_FILE || DEFAULT_FAC_WARNING_FILE,
        body
      )
    } catch (err) {
      // No body file means no issue: say so loudly rather than drop it.
      log(
        `::error::could not write the Find-A-Club warning body: ${String(err)}`
      )
      warned = 0
    }
  }
  emitOutput('fac_warnings', String(warned))
  emitOutput('completeness_promote', String(result.promote))
}

main()
  .catch(err => {
    // Never leave the output unset: an empty output must read as a hold.
    log(`[completeness-gate] unexpected: ${String(err)}`)
    emitOutput('completeness_promote', 'false')
  })
  .finally(() => {
    process.exitCode = 0
  })
