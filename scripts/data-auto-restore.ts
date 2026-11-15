/**
 * Glue for the data-pipeline `data-auto-restore` job (#2537, epic #2492).
 * Reads local files and the environment only; no GCS, no gh. The planning
 * itself is scripts/plan-data-restore.ts (#2539); this decides around it.
 *
 *   data-auto-restore.ts mode
 *       env DATA_AUTO_RESTORE -> $GITHUB_OUTPUT mode=off|dry-run|execute
 *   data-auto-restore.ts verdict
 *       env SMOKE_HEALTHY, SMOKE_RESULT_FILE, SCHEMA_UNHEALTHY,
 *       SCHEMA_RESTORE_ELIGIBLE -> outputs restore_eligible, restore_reason
 *   data-auto-restore.ts paths --manifest written.jsonl --out paths.txt
 *       the in-scope object names from the run manifest; exit 1 if none
 *   data-auto-restore.ts decide --plan plan.json
 *       env DATA_AUTO_RESTORE, UNHEALTHY -> outputs action, execute, file_issue
 *   data-auto-restore.ts report --plan plan.json
 *       env DATA_AUTO_RESTORE, UNHEALTHY, RUN_URL, FAILED, and optionally
 *       EXECUTE_OUTCOME, PURGE_OUTCOME, RECHECK_UNHEALTHY
 *       -> $RUNNER_TEMP/data-rollback-body.md; outputs body_file, title
 *
 * A plan file that is absent or unreadable is "no plan": it never executes.
 * stderr: logs (R4). Exit: 0 ok - 1 refused/failed - 2 usage.
 */

import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { parseSavedPlan, type RestorePlan } from './lib/dataRestorePlan.js'
import {
  buildIssueBody,
  buildIssueTitle,
  classifyVerdict,
  decideRestore,
  manifestPaths,
  resolveRestoreMode,
} from './lib/dataAutoRestore.js'

function output(key: string, value: string): void {
  const out = process.env['GITHUB_OUTPUT']
  if (out) appendFileSync(out, `${key}=${value}\n`)
  console.error(`output ${key}=${value}`)
}

function usage(): never {
  console.error(
    'usage: data-auto-restore.ts mode | paths --manifest F --out F | decide --plan F | report --plan F'
  )
  process.exit(2)
}

function loadPlan(file: string | undefined): RestorePlan | null {
  if (!file || !existsSync(file)) return null
  try {
    return parseSavedPlan(JSON.parse(readFileSync(file, 'utf8')))
  } catch (e) {
    console.error(
      `plan unreadable: ${e instanceof Error ? e.message : String(e)}`
    )
    return null
  }
}

const [cmd, ...rest] = process.argv.slice(2)
const { values } = parseArgs({
  args: rest,
  options: {
    manifest: { type: 'string' },
    out: { type: 'string' },
    plan: { type: 'string' },
  },
  strict: true,
})
const mode = resolveRestoreMode(process.env['DATA_AUTO_RESTORE'])
const unhealthy = process.env['UNHEALTHY'] === 'true'
// Only the exact word `true` from the data smoke's verdict: unset is not.
const restoreEligible = process.env['RESTORE_ELIGIBLE'] === 'true'
const ineligibleReason = process.env['RESTORE_REASON'] || undefined

switch (cmd) {
  case 'mode':
    output('mode', mode)
    break
  case 'verdict': {
    // Run by data-smoke's last step: classify the failure so only a decode or
    // validation failure of the published data can ever execute a restore.
    let failures: string[] | null = null
    const resultFile = process.env['SMOKE_RESULT_FILE']
    if (resultFile && existsSync(resultFile)) {
      try {
        const parsed = JSON.parse(readFileSync(resultFile, 'utf8')) as {
          failures?: unknown
        }
        if (
          Array.isArray(parsed.failures) &&
          parsed.failures.every(f => typeof f === 'string')
        ) {
          failures = parsed.failures as string[]
        }
      } catch {
        failures = null
      }
    }
    const v = classifyVerdict({
      smokeHealthy: process.env['SMOKE_HEALTHY'] ?? '',
      smokeFailures: failures,
      schemaUnhealthy: process.env['SCHEMA_UNHEALTHY'] ?? '',
      schemaRestoreEligible: process.env['SCHEMA_RESTORE_ELIGIBLE'] ?? '',
    })
    output('restore_eligible', String(v.restoreEligible))
    output('restore_reason', v.reason)
    break
  }
  case 'paths': {
    if (!values.manifest || !values.out) usage()
    const paths = manifestPaths(readFileSync(values.manifest, 'utf8'))
    if (paths.length === 0) {
      console.error('the run manifest lists no in-scope objects')
      process.exit(1)
    }
    writeFileSync(values.out, paths.join('\n') + '\n')
    console.error(`${paths.length} in-scope object(s)`)
    break
  }
  case 'decide': {
    const d = decideRestore({
      unhealthy,
      restoreEligible,
      ineligibleReason,
      mode,
      plan: loadPlan(values.plan),
    })
    output('action', d.action)
    output('execute', String(d.execute))
    output('file_issue', String(d.fileIssue))
    console.error(`${d.action}: ${d.reason}`)
    break
  }
  case 'report': {
    const plan = loadPlan(values.plan)
    const decision = decideRestore({
      unhealthy,
      restoreEligible,
      ineligibleReason,
      mode,
      plan,
    })
    const body = buildIssueBody({
      mode,
      decision,
      plan,
      runUrl: process.env['RUN_URL'] ?? '(run URL unknown)',
      failed: process.env['FAILED'] || 'the data smoke',
      executeOutcome: process.env['EXECUTE_OUTCOME'] || undefined,
      purgeOutcome: process.env['PURGE_OUTCOME'] || undefined,
      recheckUnhealthy: process.env['RECHECK_UNHEALTHY'] || undefined,
    })
    const file = join(
      process.env['RUNNER_TEMP'] ?? '/tmp',
      'data-rollback-body.md'
    )
    writeFileSync(file, body)
    output('body_file', file)
    output('title', buildIssueTitle(decision.action))
    break
  }
  default:
    usage()
}
