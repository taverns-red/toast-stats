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
 *       exit 1 if no in-scope object, 3 if the manifest is malformed
 *   data-auto-restore.ts plan-failure --stderr F --plan F --out F
 *       (decide job) the class of a failed planner run -> --out (#2858)
 *       the in-scope object names from the run manifest; exit 1 if none
 *   data-auto-restore.ts intent
 *       (decide job) env DATA_AUTO_RESTORE, UNHEALTHY, RESTORE_ELIGIBLE,
 *       RESTORE_REASON, RUN_URL, GITHUB_RUN_ID, FAILED, PROMOTE_STARTED,
 *       WINDOW_END, and the read-only enumeration (#2858): ENUM_PRECHECK_OUTCOME, ENUM_AUTH_OUTCOME,
 *       ENUM_STEP_OUTCOME, ENUM_PLAN_FILE, ENUM_ERROR_CLASS_FILE
 *       -> outputs action, execute, file_issue, title, body_file
 *   data-auto-restore.ts decide --plan plan.json (execute job)
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
  buildDecisionIssueBody,
  buildDecisionTitle,
  buildIssueBody,
  buildIssueTitle,
  classifyVerdict,
  decideIntent,
  decideRestore,
  manifestPaths,
  classifyPlanFailure,
  resolveEnumeration,
  resolveRestoreMode,
} from './lib/dataAutoRestore.js'

function output(key: string, value: string): void {
  const out = process.env['GITHUB_OUTPUT']
  if (out) appendFileSync(out, `${key}=${value}\n`)
  console.error(`output ${key}=${value}`)
}

function usage(): never {
  console.error(
    'usage: data-auto-restore.ts mode | verdict | intent | paths --manifest F --out F | plan-failure --stderr F --plan F --out F | decide --plan F | report --plan F'
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

function readErrorClass(file: string | undefined): string {
  if (!file || !existsSync(file)) return ''
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

// The buckets the data pipeline publishes through (workflow env GCS_BUCKET and
// GCS_BUCKET_PRODUCTION); named in the issue body only.
const STAGING_BUCKET = 'toast-stats-data-staging'
const PROD_BUCKET = 'toast-stats-data-ca'

const [cmd, ...rest] = process.argv.slice(2)
const { values } = parseArgs({
  args: rest,
  options: {
    manifest: { type: 'string' },
    out: { type: 'string' },
    plan: { type: 'string' },
    stderr: { type: 'string' },
  },
  strict: true,
})
const mode = resolveRestoreMode(process.env['DATA_AUTO_RESTORE'])
const unhealthy = process.env['UNHEALTHY'] === 'true'
// Only the exact word `true` from the data smoke's verdict: unset is not.
const restoreEligible = process.env['RESTORE_ELIGIBLE'] === 'true'
const ineligibleReason = process.env['RESTORE_REASON'] || undefined
// The pipeline run mode; only daily and rebuild may execute a restore (#2856).
const runMode = process.env['RUN_MODE'] ?? ''

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
    let paths: string[]
    try {
      paths = manifestPaths(readFileSync(values.manifest, 'utf8'))
    } catch (e) {
      // A malformed manifest is not an empty selection (exit 1): exit 3.
      console.error(
        `run manifest unreadable: ${e instanceof Error ? e.message : String(e)}`
      )
      process.exit(3)
    }
    if (paths.length === 0) {
      console.error('the run manifest lists no in-scope objects')
      process.exit(1)
    }
    writeFileSync(values.out, paths.join('\n') + '\n')
    console.error(`${paths.length} in-scope object(s)`)
    break
  }
  case 'plan-failure': {
    // After a failed plan-data-restore.ts in the decide job: write one fixed
    // class to --out. The stderr text is read, never printed or written.
    if (!values.stderr || !values.plan || !values.out) usage()
    let stderr = ''
    try {
      stderr = readFileSync(values.stderr, 'utf8')
    } catch {
      stderr = ''
    }
    const errorClass = classifyPlanFailure({
      stderr,
      planWritten: existsSync(values.plan),
    })
    writeFileSync(values.out, errorClass + '\n')
    console.error(`plan failure class: ${errorClass}`)
    break
  }
  case 'intent': {
    // The token-free decide job: no plan, no GCP. It files the issue and says
    // whether the execute job may start; only the exact word `execute`, an
    // unhealthy run and an eligible verdict give execute=true.
    const d = decideIntent({
      unhealthy,
      restoreEligible,
      runMode,
      ineligibleReason,
      mode,
    })
    const runId = process.env['GITHUB_RUN_ID'] ?? process.env['RUN_ID'] ?? ''
    const body = buildDecisionIssueBody({
      mode,
      decision: d,
      runId,
      runUrl: process.env['RUN_URL'] ?? '(run URL unknown)',
      failed: process.env['FAILED'] || 'the data smoke',
      stagingBucket: STAGING_BUCKET,
      prodBucket: PROD_BUCKET,
      promoteStarted: process.env['PROMOTE_STARTED'] ?? '',
      windowEnd: process.env['WINDOW_END'] ?? '',
      // The read-only enumeration (#2858). Only a fixed error class is read
      // back: GCP error text stays in the job log.
      enumeration: resolveEnumeration({
        precheckOutcome: process.env['ENUM_PRECHECK_OUTCOME'] ?? '',
        authOutcome: process.env['ENUM_AUTH_OUTCOME'] ?? '',
        enumOutcome: process.env['ENUM_STEP_OUTCOME'] ?? '',
        errorClass: readErrorClass(process.env['ENUM_ERROR_CLASS_FILE']),
        plan: loadPlan(process.env['ENUM_PLAN_FILE']),
      }),
    })
    const file = join(
      process.env['RUNNER_TEMP'] ?? '/tmp',
      'data-rollback-intent.md'
    )
    writeFileSync(file, body)
    output('action', d.action)
    output('execute', String(d.execute))
    output('file_issue', String(d.fileIssue))
    output('body_file', file)
    output('title', buildDecisionTitle(d.action))
    console.error(`${d.action}: ${d.reason}`)
    break
  }
  case 'decide': {
    const d = decideRestore({
      unhealthy,
      restoreEligible,
      runMode,
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
      runMode,
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
