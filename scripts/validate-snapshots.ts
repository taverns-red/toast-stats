/**
 * Snapshot Schema Gate — Runner (#1125)
 *
 * Thin glue around the pure functions in ./lib/snapshotPublishGate.js:
 * read every district_<id>.json in the given snapshot director(y/ies),
 * validate against the shared PerDistrictDataSchema, and FAIL (exit 1)
 * if any file violates the contract — blocking the gsutil upload step
 * that follows in data-pipeline.yml.
 *
 * Unlike the alert runners (promotion-alert, check-pipeline-freshness)
 * this is a GATE: a non-zero exit is the mechanism. Decision logic is
 * unit-tested in scripts/lib/__tests__/snapshotPublishGate.test.ts.
 * All logging goes to stderr (R4).
 *
 * Usage: npx tsx scripts/validate-snapshots.ts <snapshot-dir> [...more]
 */

import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  evaluateSnapshotFiles,
  buildGateSummary,
  isDistrictSnapshotFile,
  type SnapshotGateResult,
} from './lib/snapshotPublishGate.js'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function appendStepSummary(markdown: string): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY
  if (summaryFile) appendFileSync(summaryFile, markdown)
}

function validateDir(dir: string): SnapshotGateResult {
  if (!existsSync(dir)) {
    // A missing directory means there is nothing to certify — the gate
    // must fail loudly rather than pass vacuously (Lesson 107).
    return {
      ok: false,
      checked: 0,
      failures: [],
      reason: `snapshot directory does not exist: ${dir}`,
    }
  }

  const files = readdirSync(dir)
    .filter(isDistrictSnapshotFile)
    .sort()
    .map(fileName => ({
      fileName,
      content: readFileSync(join(dir, fileName), 'utf-8'),
    }))

  return evaluateSnapshotFiles(files)
}

function main(): void {
  const dirs = process.argv.slice(2)
  if (dirs.length === 0) {
    log('Usage: validate-snapshots.ts <snapshot-dir> [...more dirs]')
    process.exit(2)
  }

  let allOk = true
  for (const dir of dirs) {
    log(`Validating district snapshots in ${dir} ...`)
    const result = validateDir(dir)
    log(`${result.ok ? 'PASS' : 'FAIL'}: ${result.reason}`)

    for (const f of result.failures) {
      // ::error:: annotations surface district + date in the Actions UI
      console.error(
        `::error::Snapshot schema gate: district ${f.districtId ?? '?'} ` +
          `(snapshot ${f.snapshotDate ?? '?'}) in ${f.fileName} — ${f.reason}`
      )
    }
    if (!result.ok && result.failures.length === 0) {
      console.error(`::error::Snapshot schema gate: ${result.reason} (${dir})`)
    }

    appendStepSummary(buildGateSummary(result, { snapshotDir: dir }))
    if (!result.ok) allOk = false
  }

  process.exit(allOk ? 0 : 1)
}

main()
