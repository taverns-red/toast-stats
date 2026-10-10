/**
 * Pre-promotion Content Gate — Runner (#1715, plan S1-4)
 *
 * Thin glue around ./lib/promotionContentGate.js, run on the CI runner just
 * before `Promote staging to production`:
 *   1. list the promoted prefixes in staging and production (metadata only),
 *   2. keep the staging objects promotion would copy (new, or different
 *      bytes) — never the whole bucket,
 *   3. read a bounded sample of those from staging (stored bytes plus
 *      Content-Encoding, decoded the way a browser does) and check bytes,
 *      parse and shape,
 *   4. emit `content_promote` and write the result for the promotion-held
 *      alert. Nothing is written to any bucket.
 *
 * Decision logic is unit-tested in
 * scripts/lib/__tests__/promotionContentGate.test.ts; listing/reading lives in
 * ./lib/promotionContentGateIo.js. Logs go to stderr (R4).
 * Always exits 0: like the value gate, the decision flows through the step
 * output so the promotion-held steps stay reachable. Any error FAILS CLOSED
 * (content_promote=false).
 *
 * Env: GCS_BUCKET (staging), GCS_BUCKET_PRODUCTION,
 *      CONTENT_GATE_FILE (default /tmp/content-gate.json)
 */

import { appendFileSync, writeFileSync } from 'node:fs'
import { Storage } from '@google-cloud/storage'
import {
  buildContentGateSummary,
  evaluateContentGate,
  type ContentGateResult,
} from './lib/promotionContentGate.js'
import {
  runContentGate,
  type GateBucket,
} from './lib/promotionContentGateIo.js'

const DEFAULT_RESULT_FILE = '/tmp/content-gate.json'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function emitOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

async function run(): Promise<ContentGateResult> {
  const stagingName = process.env.GCS_BUCKET
  const prodName = process.env.GCS_BUCKET_PRODUCTION
  if (!stagingName || !prodName) {
    throw new Error('GCS_BUCKET and GCS_BUCKET_PRODUCTION must be set')
  }
  const storage = new Storage()
  return runContentGate(
    storage.bucket(stagingName) as unknown as GateBucket,
    storage.bucket(prodName) as unknown as GateBucket,
    log
  )
}

async function main(): Promise<void> {
  const resultFile = process.env.CONTENT_GATE_FILE || DEFAULT_RESULT_FILE
  let result: ContentGateResult
  try {
    result = await run()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[content-gate] error: ${message}`)
    result = evaluateContentGate({
      changedCount: 0,
      results: [],
      error: message,
    })
  }

  for (const f of result.failures.slice(0, 50)) {
    log(`::error title=Content gate::${f.path}: ${f.reason}`)
  }
  log(`[content-gate] ${result.promote ? 'PASS' : 'HOLD'} — ${result.reason}`)

  try {
    writeFileSync(resultFile, JSON.stringify(result, null, 2))
    const summaryFile = process.env.GITHUB_STEP_SUMMARY
    if (summaryFile)
      appendFileSync(summaryFile, buildContentGateSummary(result))
  } catch (err) {
    log(`[content-gate] could not write result: ${String(err)}`)
  }
  emitOutput('content_promote', String(result.promote))
}

main()
  .catch(err => {
    // Last resort: never leave the output unset — an empty output must not
    // read as anything but a hold.
    log(`[content-gate] unexpected: ${String(err)}`)
    emitOutput('content_promote', 'false')
  })
  .finally(() => {
    process.exitCode = 0
  })
