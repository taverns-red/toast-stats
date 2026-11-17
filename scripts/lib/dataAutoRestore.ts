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
  | 'mode-refused'

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

/**
 * The pipeline run modes whose publish a restore may undo (#2856, COO
 * decision 3). Every other mode (proof and backfill runs, rescrapes, prune)
 * gets a plan only. Exact match: an unknown, empty or differently cased mode
 * does not execute.
 */
const EXECUTABLE_RUN_MODES: readonly string[] = ['daily', 'rebuild']

export function runModeMayExecute(runMode: string | undefined): boolean {
  return runMode !== undefined && EXECUTABLE_RUN_MODES.includes(runMode)
}

const modeRefusal = (runMode: string | undefined): RestoreDecision => ({
  action: 'mode-refused',
  execute: false,
  fileIssue: true,
  reason: `run mode ${runMode ? `\`${runMode}\`` : '(unknown)'}: a restore executes only for daily and rebuild runs; this run gets a plan only`,
})

const acts = (e: PlanEntry): boolean =>
  e.action === 'restore' || e.action === 'delete'

export function decideRestore(input: {
  unhealthy: boolean
  /** The verdict is a decode or validation failure (see classifyVerdict). */
  restoreEligible: boolean
  ineligibleReason?: string
  mode: RestoreMode
  /** The pipeline run mode (daily, rebuild, prune...). */
  runMode?: string
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
    if (!runModeMayExecute(input.runMode)) return modeRefusal(input.runMode)
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

/**
 * A markdown code span that a name cannot break out of: the fence is one
 * backtick longer than the longest backtick run in the text (padded with a
 * space when the text touches a backtick).
 */
export function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? []
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0)
  if (longest === 0) return `\`${text}\``
  const fence = '`'.repeat(longest + 1)
  return `${fence} ${text} ${fence}`
}

// A name in a table cell: a pipe would end the cell even inside a code span.
const nameCell = (name: string): string =>
  codeSpan(name.replace(/[\\|]/g, '\\$&'))

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
          `| ${nameCell(e.name)} | ${e.generation ?? ''} | ${e.liveGeneration} | ${cell(e.reason)} |`
      )
    : shown.map(
        e => `| ${nameCell(e.name)} | ${e.liveGeneration} | ${cell(e.reason)} |`
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

/** ", N removed on purpose, M not restorable automatically", or nothing. */
function removalCounts(excluded: number, manual: number): string {
  return (
    (excluded > 0 ? `, ${excluded} removed on purpose` : '') +
    (manual > 0 ? `, ${manual} not restorable automatically` : '')
  )
}

/** Objects the run's removal record names: no generation columns apply. */
function removalTable(entries: PlanEntry[], cap: number): string[] {
  const rows = entries
    .slice(0, cap)
    .map(e => `| ${nameCell(e.name)} | ${cell(e.reason)} |`)
  const more =
    entries.length > cap
      ? [``, `…and ${entries.length - cap} more (full plan in the artifact).`]
      : []
  return ['| Object | Why |', '|---|---|', ...rows, ...more]
}

interface ListCaps {
  restores: number
  deletes: number
  refused: number
}
const LIST_CAPS: ListCaps = {
  restores: LIST_RESTORES,
  deletes: LIST_DELETES,
  refused: LIST_REFUSED,
}

/**
 * The enumerated plan as issue lines: the counts, then the refused, removed
 * and restored objects, each list capped (the full plan is an artifact).
 */
function planSectionLines(
  plan: RestorePlan,
  artifact: string,
  caps: ListCaps
): string[] {
  const L: string[] = []
  const by = (a: PlanEntry['action']) =>
    plan.entries.filter(e => e.action === a)
  L.push(
    '## Restore plan',
    '',
    `Window: ${plan.since} to ${plan.until}. Bucket: \`${plan.bucket}\`.`,
    '',
    `${plan.entries.length} object(s) from the run manifest and its removal record: ${by('restore').length} to restore, ${by('delete').length} to delete (created by the run), ${by('noop').length} untouched, ${by('refuse').length} refused${removalCounts(by('excluded').length, by('manual').length)}.`,
    '',
    `The full plan is attached to the run as an artifact (\`${artifact}\`).`,
    ''
  )
  if (by('refuse').length > 0) {
    L.push(
      '### Refused (nothing was executed)',
      '',
      ...table(by('refuse'), caps.refused, false),
      ''
    )
  }
  if (by('manual').length > 0) {
    L.push(
      '### Prune deletes (not restorable automatically: a person decides)',
      '',
      ...removalTable(by('manual'), caps.deletes),
      ''
    )
  }
  if (by('excluded').length > 0) {
    L.push(
      '### Removed on purpose (not restored)',
      '',
      ...removalTable(by('excluded'), caps.deletes),
      ''
    )
  }
  if (by('delete').length > 0) {
    L.push('### Objects the run created (removed)', '')
    L.push(...table(by('delete'), caps.deletes, false), '')
  }
  if (by('restore').length > 0) {
    const entry = by('restore').filter(
      e => e.name === 'v1/latest.json' || e.name === 'v1/dates.json'
    )
    const rest = by('restore').filter(e => !entry.includes(e))
    L.push(
      '### Objects to restore',
      '',
      ...table([...entry, ...rest], caps.restores, true),
      ''
    )
  }
  return L
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
  L.push(...planSectionLines(plan, 'data-restore-plan', LIST_CAPS))
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
  /** The pipeline run mode (daily, rebuild, prune...). */
  runMode?: string
}

/**
 * The decision made from the verdict and the variable alone, before any plan
 * exists (the decide job never uses a write identity). It says only whether the execute job may start; the execute
 * job re-plans and refuses on anything unclean. Fails closed: `execute` needs
 * unhealthy data, an eligible verdict and the exact word `execute`.
 */
export function decideIntent(i: IntentInput): RestoreDecision {
  if (!i.unhealthy) {
    return {
      action: 'skip',
      execute: false,
      fileIssue: false,
      reason: 'the published data is healthy',
    }
  }
  if (i.mode === 'off') {
    return {
      action: 'off',
      execute: false,
      fileIssue: true,
      reason: 'DATA_AUTO_RESTORE=off: no restore was planned',
    }
  }
  if (!i.restoreEligible) {
    return {
      action: 'not-eligible',
      execute: false,
      fileIssue: true,
      reason: `not restored: ${i.ineligibleReason ?? 'the failure is not a decode or validation failure of the published data'}`,
    }
  }
  if (i.mode === 'execute') {
    if (!runModeMayExecute(i.runMode)) return modeRefusal(i.runMode)
    return {
      action: 'execute',
      execute: true,
      fileIssue: true,
      reason:
        'DATA_AUTO_RESTORE=execute and the failure is a decode or validation failure: the execute job was started',
    }
  }
  return {
    action: 'dry-run',
    execute: false,
    fileIssue: true,
    reason: 'dry-run: DATA_AUTO_RESTORE is not set to execute',
  }
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
  /** What the decide job's read-only enumeration found (#2858); absent = none. */
  enumeration?: Enumeration
}

/** The failure classes the issue may name; anything else collapses (#2858). */
const ENUM_ERROR_CLASSES = [
  'auth-failed',
  'manifest-unreadable',
  'removal-record-unreadable',
  'no-in-scope-objects',
  'listing-failed',
  'plan-refused',
  'plan-failed',
] as const

export type Enumeration =
  | { kind: 'plan'; plan: RestorePlan }
  | { kind: 'failed'; errorClass: string }
  | { kind: 'skipped' }

/**
 * Turns the decide job's step outcomes into what the issue says. A plan that
 * loaded is always shown (a refused plan exits non-zero but carries its
 * refusals). A failure is named by a fixed class only: GCP error text can
 * carry service account emails and project paths, so it stays in the job log.
 */
export function resolveEnumeration(i: {
  /** The reader-variable precheck (#2858); failure means the variable is empty. */
  precheckOutcome?: string
  authOutcome: string
  enumOutcome: string
  errorClass: string
  plan: RestorePlan | null
}): Enumeration {
  if (i.plan !== null) return { kind: 'plan', plan: i.plan }
  if (i.precheckOutcome === 'failure' || i.authOutcome === 'failure') {
    return { kind: 'failed', errorClass: 'auth-failed' }
  }
  if (i.authOutcome !== 'success' || i.enumOutcome === 'skipped') {
    return { kind: 'skipped' }
  }
  const known = (ENUM_ERROR_CLASSES as readonly string[]).includes(i.errorClass)
  return {
    kind: 'failed',
    errorClass: known ? i.errorClass : 'plan-failed',
  }
}

/**
 * Why plan-data-restore.ts exited non-zero, as one of the fixed classes. A
 * plan file means the planner finished and refused entries; without one, a
 * stderr that blames a listing is a listing failure, anything else a plain
 * failure. Only this class reaches the issue, never the stderr text.
 */
export function classifyPlanFailure(i: {
  stderr: string
  planWritten: boolean
}): 'plan-refused' | 'listing-failed' | 'plan-failed' {
  if (i.planWritten) return 'plan-refused'
  if (/\blisting\b/.test(i.stderr)) return 'listing-failed'
  return 'plan-failed'
}

// An issue body is capped at 65,536 characters; stay well under it.
const DECISION_BODY_MAX = 60000
const SMALL_CAPS: ListCaps = { restores: 10, deletes: 10, refused: 20 }

/**
 * The data-rollback issue the decide job files. It names the run, the verdict
 * and the manifest, gives the exact command to plan by hand, and, when the
 * read-only enumeration worked (#2858), the planned objects (capped; the full
 * plan is an artifact). A failed enumeration is named by class only.
 */
export function buildDecisionIssueBody(c: DecisionIssueContext): string {
  const full = decisionIssueBody(c, LIST_CAPS)
  return full.length <= DECISION_BODY_MAX
    ? full
    : decisionIssueBody(c, SMALL_CAPS)
}

function decisionIssueBody(c: DecisionIssueContext, caps: ListCaps): string {
  const manifest = `gs://${c.stagingBucket}/runs/${c.runId}/written.jsonl`
  const removalRecord = `gs://${c.stagingBucket}/runs/${c.runId}/prod-removed.jsonl`
  const since = c.promoteStarted || '<promotion start>'
  const until = c.windowEnd || '<smoke end>'
  const started = c.decision.execute
    ? 'The restore execute job was started; it re-plans, refuses on anything unclean, and comments the enumerated plan and result here.'
    : 'No restore was started.'
  return (
    [
      `The post-promotion check failed (${c.failed}) on run ${c.runUrl}.`,
      '',
      `- **Run**: ${c.runId}`,
      `- **Mode**: \`${c.mode}\``,
      `- **Decision**: \`${c.decision.action}\`: ${c.decision.reason}`,
      `- **Run manifest**: \`${manifest}\``,
      '',
      started,
      '',
      '## Plan it by hand',
      '',
      'From a checkout, with read access to both buckets (see docs/runbooks/data-restore.md):',
      '',
      '```',
      `gcloud storage cat ${manifest} > written.jsonl`,
      `gcloud storage cat ${removalRecord} > removed.jsonl   # skip if the run removed nothing from prod; then use an empty file`,
      'npx tsx scripts/data-auto-restore.ts paths --manifest written.jsonl --out paths.txt',
      `PROD_BUCKET=${c.prodBucket} bash scripts/pipeline/list-restore-candidates.sh out paths.txt`,
      `npx tsx scripts/plan-data-restore.ts --live out/live.json --soft-deleted out/soft.json --live-errors out/live.err --soft-errors out/soft.err --since ${since} --until ${until} --paths paths.txt --removals removed.jsonl --out plan.json`,
      '```',
      '',
      ...enumerationLines(c.enumeration, caps),
      '## Next',
      '',
      'See docs/runbooks/data-restore.md: stop the next publish, fix the cause, and fix staging if a date was removed (#2540). `DATA_AUTO_RESTORE=execute` is what lets the execute job run; unset, nothing is restored.',
    ].join('\n') + '\n'
  )
}

function enumerationLines(
  e: Enumeration | undefined,
  caps: ListCaps
): string[] {
  if (e === undefined) return []
  if (e.kind === 'plan') {
    return [
      ...planSectionLines(e.plan, 'data-restore-plan-dry-run', caps),
      'Enumerated read-only by the decide job; nothing was written.',
      '',
    ]
  }
  if (e.kind === 'failed') {
    return [
      `enumeration failed: ${e.errorClass}. Plan it by hand with the commands above; the job log has the detail.`,
      '',
    ]
  }
  return [
    'Plan enumeration skipped (it runs on main with the reader identity, and not when DATA_AUTO_RESTORE=off). Plan it by hand with the commands above.',
    '',
  ]
}

export function buildDecisionTitle(action: RestoreAction): string {
  return action === 'execute'
    ? 'data-rollback: post-promotion check failed, restore started'
    : 'data-rollback: post-promotion check failed, no restore run'
}
