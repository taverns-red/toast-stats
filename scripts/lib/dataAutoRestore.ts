/**
 * Auto-restore decisions (#2537, epic #2492). Pure: no GCS, no gh.
 *
 * When the post-promotion data smoke (#2538) reports bad data, the
 * `data-auto-restore` job plans a restore of what the run wrote with the one
 * planner, scripts/plan-data-restore.ts (#2539), and files a `data-rollback`
 * issue. This module holds the parts around that planner: what the
 * DATA_AUTO_RESTORE repository variable means, which manifest paths are in
 * scope, whether a plan may be executed, and what the issue says.
 *
 * Safety: the default mode is `dry-run` (plan and report only). Only the
 * exact value `execute` restores; any other value, a typo included, plans.
 * A plan with any refused entry, or no plan at all, never executes.
 */

import type { PlanEntry, RestorePlan } from './dataRestorePlan.js'

export type RestoreMode = 'off' | 'dry-run' | 'execute'
export type RestoreAction =
  | 'skip'
  | 'off'
  | 'plan-only'
  | 'execute'
  | 'refused'
  | 'plan-failed'
  | 'nothing-to-do'
  | 'not-eligible'
  | 'dry-run'

export interface RestoreDecision {
  action: RestoreAction
  execute: boolean
  fileIssue: boolean
  reason: string
}

export interface IssueContext {
  mode: RestoreMode
  decision: RestoreDecision
  plan: RestorePlan | null
  runUrl: string
  /** What failed, for the opening line (e.g. "the schema check"). */
  failed: string
  executeOutcome?: string
  purgeOutcome?: string
  /** The re-check after the restore: 'false' means healthy again. */
  recheckUnhealthy?: string
}

/** What an unset DATA_AUTO_RESTORE means. Never `execute`: Ron turns that on. */
export const DEFAULT_RESTORE_MODE: RestoreMode = 'dry-run'

export function resolveRestoreMode(raw: string | undefined): RestoreMode {
  // Exact match only: ' Execute ' or 'EXECUTE' is a typo, and a typo plans.
  if (raw === 'execute') return 'execute'
  if (raw === 'off') return 'off'
  return DEFAULT_RESTORE_MODE
}

/**
 * Prefixes the restore may touch: the ones the promotion copies into prod
 * (scripts/lib/promotionContentGate.ts MANIFEST_GATED_PREFIXES, kept literal
 * here so a change there is a deliberate decision about the restore). The
 * share cards (og/) are left out: the og-cards job writes them in parallel
 * with the data smoke, after the restore window closes, and the planner
 * refuses an object newer than the window.
 */
const RESTORE_PREFIXES = [
  'v1/',
  'snapshots/',
  'time-series/',
  'config/',
  'derived/education-rollup/',
  'derived/education-timeline/',
] as const

/** Object names from a run manifest (written.jsonl), in scope, sorted, unique. */
export function manifestPaths(jsonl: string): string[] {
  const out = new Set<string>()
  jsonl.split('\n').forEach((line, i) => {
    if (line.trim() === '') return
    let p: unknown
    try {
      p = (JSON.parse(line) as { path?: unknown }).path
    } catch {
      throw new Error(`run manifest line ${i + 1} is not JSON`)
    }
    if (typeof p !== 'string' || p === '') {
      throw new Error(`run manifest line ${i + 1} has no path`)
    }
    if (RESTORE_PREFIXES.some(prefix => p.startsWith(prefix))) out.add(p)
  })
  return [...out].sort()
}

const acts = (e: PlanEntry): boolean =>
  e.action === 'restore' || e.action === 'delete'

export function decideRestore(input: {
  unhealthy: boolean
  /** The verdict is a decode or validation failure (see classifyVerdict). */
  restoreEligible: boolean
  ineligibleReason?: string
  mode: RestoreMode
  plan: RestorePlan | null
}): RestoreDecision {
  const { unhealthy, mode, plan } = input
  if (!unhealthy) {
    return {
      action: 'skip',
      execute: false,
      fileIssue: false,
      reason: 'the published data is healthy',
    }
  }
  if (mode === 'off') {
    return {
      action: 'off',
      execute: false,
      fileIssue: true,
      reason: 'DATA_AUTO_RESTORE=off: no plan was made',
    }
  }
  if (plan === null) {
    return {
      action: 'plan-failed',
      execute: false,
      fileIssue: true,
      reason: 'the restore plan could not be built (see the planner log)',
    }
  }
  if (plan.refused > 0 || plan.entries.some(e => e.action === 'refuse')) {
    return {
      action: 'refused',
      execute: false,
      fileIssue: true,
      reason: `${plan.refused} object(s) refused: nothing is executed; resolve them by hand`,
    }
  }
  if (!input.restoreEligible) {
    return {
      action: 'not-eligible',
      execute: false,
      fileIssue: true,
      reason: `not restored: ${input.ineligibleReason ?? 'the failure is not a decode or validation failure of the published data'}`,
    }
  }
  if (!plan.entries.some(acts)) {
    return {
      action: 'nothing-to-do',
      execute: false,
      fileIssue: true,
      reason: 'the plan has nothing to restore or delete',
    }
  }
  if (mode === 'execute') {
    return {
      action: 'execute',
      execute: true,
      fileIssue: true,
      reason: 'a clean plan, DATA_AUTO_RESTORE=execute',
    }
  }
  return {
    action: 'plan-only',
    execute: false,
    fileIssue: true,
    reason: 'dry-run: DATA_AUTO_RESTORE is not set to execute',
  }
}

export function buildIssueTitle(action: RestoreAction): string {
  switch (action) {
    case 'execute':
      return 'data-rollback: prod data restored after a failed post-promotion check'
    case 'plan-only':
      return 'data-rollback: post-promotion check failed, restore planned (dry-run)'
    case 'refused':
      return 'data-rollback: post-promotion check failed, restore plan refused'
    default:
      return 'data-rollback: post-promotion check failed, no restore run'
  }
}

// GitHub caps an issue body at 65,536 characters; a daily manifest plans
// about a thousand objects. List the ones a person must read, count the rest.
const LIST_RESTORES = 40
const LIST_DELETES = 100
const LIST_REFUSED = 100

const cell = (s: string): string =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\n/g, ' ')

function table(entries: PlanEntry[], cap: number, restore: boolean): string[] {
  const shown = entries.slice(0, cap)
  const rows = restore
    ? shown.map(
        e =>
          `| \`${e.name}\` | ${e.generation ?? ''} | ${e.liveGeneration} | ${cell(e.reason)} |`
      )
    : shown.map(
        e => `| \`${e.name}\` | ${e.liveGeneration} | ${cell(e.reason)} |`
      )
  const head = restore
    ? [
        '| Object | Restore generation | Live generation | Why |',
        '|---|---|---|---|',
      ]
    : ['| Object | Live generation | Why |', '|---|---|---|']
  const more =
    entries.length > cap
      ? [``, `…and ${entries.length - cap} more (full plan in the artifact).`]
      : []
  return [...head, ...rows, ...more]
}

export function buildIssueBody(ctx: IssueContext): string {
  const { decision, plan } = ctx
  const L: string[] = []
  L.push(
    `The post-promotion check failed (${ctx.failed}) on run ${ctx.runUrl}.`,
    '',
    `- **Mode**: \`${ctx.mode}\``,
    `- **Decision**: \`${decision.action}\`: ${decision.reason}`
  )
  if (ctx.executeOutcome !== undefined) {
    L.push(
      `- **Restore**: ${
        ctx.executeOutcome === 'success'
          ? 'restored (objects put back from soft delete, run-created objects removed)'
          : `did not complete (${ctx.executeOutcome}); some objects may be restored and some not, see the log`
      }`
    )
  }
  if (ctx.purgeOutcome !== undefined) {
    L.push(`- **CDN purge**: ${ctx.purgeOutcome}`)
  }
  if (ctx.recheckUnhealthy !== undefined) {
    L.push(
      `- **Re-check after the restore**: ${
        ctx.recheckUnhealthy === 'false'
          ? 'healthy'
          : 'STILL UNHEALTHY or not run: check by hand'
      }`
    )
  }
  L.push('')
  if (plan === null) {
    L.push(
      '## No plan',
      '',
      `No restore plan exists for this run (${decision.reason}). Follow the manual procedure in docs/runbooks/data-restore.md.`
    )
    return L.join('\n') + '\n'
  }
  const by = (a: PlanEntry['action']) =>
    plan.entries.filter(e => e.action === a)
  L.push(
    '## Restore plan',
    '',
    `Window: ${plan.since} to ${plan.until}. Bucket: \`${plan.bucket}\`.`,
    '',
    `${plan.entries.length} object(s) from the run manifest: ${by('restore').length} to restore, ${by('delete').length} to delete (created by the run), ${by('noop').length} untouched, ${by('refuse').length} refused.`,
    '',
    'The full plan is attached to the run as an artifact (`data-restore-plan`).',
    ''
  )
  if (by('refuse').length > 0) {
    L.push(
      '### Refused (nothing was executed)',
      '',
      ...table(by('refuse'), LIST_REFUSED, false),
      ''
    )
  }
  if (by('delete').length > 0) {
    L.push('### Objects the run created (removed)', '')
    L.push(...table(by('delete'), LIST_DELETES, false), '')
  }
  if (by('restore').length > 0) {
    const entry = by('restore').filter(
      e => e.name === 'v1/latest.json' || e.name === 'v1/dates.json'
    )
    const rest = by('restore').filter(e => !entry.includes(e))
    L.push(
      '### Objects to restore',
      '',
      ...table([...entry, ...rest], LIST_RESTORES, true),
      ''
    )
  }
  L.push(
    '## Next',
    '',
    'See docs/runbooks/data-restore.md: stop the next publish, fix the cause, and fix staging if a date was removed (#2540). `DATA_AUTO_RESTORE=execute` is what turns the restore on; unset, this job only plans.'
  )
  return L.join('\n') + '\n'
}

export interface VerdictInput {
  /** The smoke step's `healthy` output: 'true', 'false', or '' (it crashed). */
  smokeHealthy: string
  /** The smoke result file's `failures` ("probe: detail"); null if unreadable. */
  smokeFailures: string[] | null
  /** The schema step's `unhealthy` output: 'true', 'false', or ''. */
  schemaUnhealthy: string
  /** The schema step's `restore_eligible` output (see restoreEligibleFromCanary). */
  schemaRestoreEligible: string
}

/**
 * The cdn-data probe's own decode and validation failures
 * (checkCdnLatest in hostingRollback.ts). An HTTP status failure is a fetch
 * problem, not bad data.
 */
const CDN_DATA_DECODE =
  /^cdn-data: (latest\.json is not JSON|no YYYY-MM-DD latestSnapshotDate)$/

/**
 * Whether the data smoke's verdict is bad enough, and of the right kind, to
 * restore (#2492: "restore only on decode or schema failures, never on
 * freshness"). Eligible only when every failure is a decode or validation
 * failure of the published data and at least one exists. Hosting probe
 * failures, a crashed or never-run step, freshness, fetch and shape failures
 * are all ineligible; the reason names what blocked it.
 */
export function classifyVerdict(i: VerdictInput): {
  restoreEligible: boolean
  reason: string
} {
  const blockers: string[] = []
  let dataFailure = false

  if (i.smokeHealthy === 'true') {
    // fine
  } else if (i.smokeHealthy === 'false' && i.smokeFailures !== null) {
    const bad = i.smokeFailures.filter(f => !CDN_DATA_DECODE.test(f))
    if (bad.length > 0) {
      blockers.push(
        `the smoke failed on something other than cdn-data decode or validation (${bad.map(f => f.split(':')[0]).join(', ')})`
      )
    } else if (i.smokeFailures.length === 0) {
      blockers.push('the smoke reported unhealthy with no failing probe')
    } else {
      dataFailure = true
    }
  } else {
    blockers.push('the smoke step crashed or left no readable result')
  }

  if (i.schemaUnhealthy === 'false') {
    // fine
  } else if (i.schemaUnhealthy === 'true') {
    if (i.schemaRestoreEligible === 'true') dataFailure = true
    else {
      blockers.push(
        'the schema check failed on something other than decode or validation (fetch, freshness or shape)'
      )
    }
  } else {
    blockers.push('the schema check crashed or did not run')
  }

  if (blockers.length === 0 && !dataFailure) {
    blockers.push('no decode or validation failure was found')
  }
  return blockers.length === 0
    ? { restoreEligible: true, reason: 'a decode or validation failure' }
    : { restoreEligible: false, reason: blockers.join('; ') }
}

export interface IntentInput {
  unhealthy: boolean
  mode: RestoreMode
  restoreEligible: boolean
  ineligibleReason?: string
}

/** Red-phase stub: the next commit implements it. */
export function decideIntent(i: IntentInput): RestoreDecision {
  void i
  return { action: 'execute', execute: true, fileIssue: true, reason: 'stub' }
}

export interface DecisionIssueContext {
  mode: RestoreMode
  decision: RestoreDecision
  runId: string
  runUrl: string
  failed: string
  stagingBucket: string
  prodBucket: string
  promoteStarted: string
  windowEnd: string
}

/** Red-phase stub: the next commit implements it. */
export function buildDecisionIssueBody(c: DecisionIssueContext): string {
  void c
  return ''
}

/** Red-phase stub: the next commit implements it. */
export function buildDecisionTitle(action: RestoreAction): string {
  void action
  return ''
}
