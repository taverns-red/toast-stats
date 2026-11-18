/**
 * `agent-cli ci-wait <pr>` (#2418): block until a PR's checks finish, print
 * only what failed, exit non-zero on any failure. Wait-only — it reads
 * `gh pr checks --json` (or, where GraphQL is blocked, the REST check-runs;
 * #2485) on an interval and never re-runs, approves or merges anything.
 *
 * Replaces the hand-written `sleep N; gh pr checks; break` loops that were
 * the largest measured cost in this repo's sessions (taverns-red/ops#148).
 *
 * PASS needs green checks, a mergeable PR (mergeStateStatus, #2905) and no
 * unfinished workflow run on the head commit (#2910).
 */
import { CommandError, runGhJson, runGhResult, type Runner } from './exec.js'
import { assertRateLimitBudget, rateLimitAware } from './rateLimit.js'

/** The shortest, and default, gap between polls (Ron, 2026-11-17, #2892). */
export const MIN_INTERVAL_MS = 60_000

/** One row of `gh pr checks --json name,state,bucket,link,workflow,startedAt,completedAt`. */
export interface PrCheck {
  name: string
  state: string
  /** pass | fail | pending | skipping | cancel */
  bucket: string
  link: string
  workflow: string
  startedAt: string
  completedAt: string
}

export const CHECK_FIELDS =
  'name,state,bucket,link,workflow,startedAt,completedAt'

export interface CheckSummary {
  total: number
  passed: number
  failed: number
  pending: number
  skipped: number
  cancelled: number
  failures: PrCheck[]
  cancelledChecks: PrCheck[]
  pendingChecks: PrCheck[]
  /** At least one check exists and none is pending. */
  done: boolean
}

/**
 * Whether `c` should replace `prev` as the row kept for a check (#2840).
 * - A pending check wins: a queued run has an empty `startedAt` and is the
 *   newest there is, and a still-running attempt is not settled.
 * - A skipped row carries no verdict (a no-op edit's run has every job
 *   skipped), so it never replaces a pass or a failure, whichever started
 *   later.
 * - A cancelled row is different: a newer cancelled run is not a verdict, but
 *   an older pass can come from a draft run that skipped the smokes, so
 *   letting it hide the cancelled run would give a premature PASS. The later
 *   `startedAt` wins, as for a re-run (PR 2482 pins this).
 */
function supersedes(c: PrCheck, prev: PrCheck): boolean {
  const pending = (x: PrCheck) => x.bucket === 'pending'
  if (pending(c) !== pending(prev)) return pending(c)
  const verdict = (x: PrCheck) => x.bucket !== 'skipping'
  if (!pending(c) && verdict(c) !== verdict(prev)) return verdict(c)
  // Not started yet means newer than anything that has.
  const at = (x: PrCheck) => x.startedAt || '￿'
  return at(c) > at(prev)
}

/** A re-run leaves the old attempt in the list; keep the newest per check. */
export function latestPerCheck(checks: PrCheck[]): PrCheck[] {
  const latest = new Map<string, PrCheck>()
  for (const c of checks) {
    const key = `${c.workflow}\u0000${c.name}`
    const prev = latest.get(key)
    if (!prev || supersedes(c, prev)) latest.set(key, c)
  }
  return [...latest.values()]
}

export function summarizeChecks(checks: PrCheck[]): CheckSummary {
  const latest = latestPerCheck(checks)
  const by = (b: string) => latest.filter(c => c.bucket === b)
  const failures = by('fail')
  const cancelledChecks = by('cancel')
  const pendingChecks = by('pending')
  return {
    total: latest.length,
    passed: by('pass').length,
    failed: failures.length,
    pending: pendingChecks.length,
    skipped: by('skipping').length,
    cancelled: cancelledChecks.length,
    failures,
    cancelledChecks,
    pendingChecks,
    done: latest.length > 0 && pendingChecks.length === 0,
  }
}

export interface FetchOptions {
  repo: string
  runner: Runner
  sleep?: (ms: number) => Promise<void>
}

/**
 * `gh pr checks --json` exits 8 while checks are pending and 1 when one
 * failed, yet still prints the JSON — so any exit with a JSON array on
 * stdout is a usable answer. "no checks reported" means none registered yet.
 *
 * `gh pr checks` goes through GraphQL, which the cloud-session proxy
 * rejects with a 403 (#2485); then the same rows are built from REST.
 */
export async function fetchPrChecks(
  pr: number,
  opts: FetchOptions
): Promise<PrCheck[]> {
  return (await fetchPrChecksFull(pr, opts)).checks
}

/** The checks, plus the REST pull request when they were read over REST. */
export interface ChecksRead {
  checks: PrCheck[]
  /** Set only when REST was used; it carries the head SHA and merge state. */
  pull?: RestPull
  /** Set with `pull`: the workflow runs of the head commit, all pages. */
  workflowRuns?: WorkflowRun[]
}

/** The fields of `GET /repos/{o}/{r}/pulls/{n}` that ci-wait reads. */
export interface RestPull {
  head: { sha: string }
  state?: string
  mergeable_state?: string | null
  /** True for a draft PR, whatever mergeable_state says (#2910). */
  draft?: boolean
}

async function fetchPrChecksFull(
  pr: number,
  opts: FetchOptions
): Promise<ChecksRead> {
  let r
  try {
    r = await runGhResult(
      ['pr', 'checks', String(pr), '--repo', opts.repo, '--json', CHECK_FIELDS],
      { runner: opts.runner, sleep: opts.sleep },
      res =>
        res.code === 0 ||
        res.stdout.trim().startsWith('[') ||
        /no checks reported/i.test(res.stderr)
    )
  } catch (err) {
    if (err instanceof CommandError && isGraphQlBlocked(err)) {
      return fetchPrChecksRestFull(pr, opts)
    }
    throw err
  }
  if (!r.stdout.trim().startsWith('[')) return { checks: [] }
  return { checks: JSON.parse(r.stdout) as PrCheck[] }
}

function isGraphQlBlocked(err: CommandError): boolean {
  const text = `${err.result.stderr}\n${err.result.stdout}`
  return /GraphQL/i.test(text) || /HTTP 403/.test(text)
}

/** The fields of a workflow run (`GET /repos/{o}/{r}/actions/runs`) read here. */
export interface WorkflowRun {
  id?: number
  created_at?: string | null
  name?: string | null
  check_suite_id: number
  status?: string | null
  event?: string | null
  pull_requests?: Array<{ number: number }> | null
  html_url?: string | null
}

/** One check-run from `GET /repos/{o}/{r}/commits/{sha}/check-runs`. */
export interface RestCheckRun {
  name: string
  status: string
  conclusion: string | null
  details_url: string | null
  html_url?: string | null
  started_at: string | null
  completed_at: string | null
  check_suite?: { id: number } | null
}

const PER_PAGE = 100

/** Walks `?per_page=100&page=N` until `total_count` items are read. */
async function fetchAllPages<T>(
  path: string,
  key: string,
  opts: FetchOptions
): Promise<T[]> {
  const all: T[] = []
  const sep = path.includes('?') ? '&' : '?'
  for (let page = 1; ; page++) {
    const body = await runGhJson<Record<string, unknown>>(
      ['api', `${path}${sep}per_page=${PER_PAGE}&page=${page}`],
      { runner: opts.runner, sleep: opts.sleep }
    )
    const items = (body[key] as T[] | undefined) ?? []
    all.push(...items)
    const total = Number(body.total_count ?? 0)
    if (items.length === 0 || all.length >= total) return all
  }
}

/**
 * gh's state for a check-run: the conclusion once completed, else the
 * status, upper-cased; and its bucket, as `gh pr checks` assigns it.
 */
export function restCheckState(run: RestCheckRun): {
  state: string
  bucket: string
} {
  const state = (
    run.status === 'completed' && run.conclusion ? run.conclusion : run.status
  ).toUpperCase()
  switch (state) {
    case 'SUCCESS':
      return { state, bucket: 'pass' }
    case 'SKIPPED':
    case 'NEUTRAL':
      return { state, bucket: 'skipping' }
    case 'FAILURE':
    case 'ERROR':
    case 'TIMED_OUT':
    case 'ACTION_REQUIRED':
    case 'STARTUP_FAILURE':
      return { state, bucket: 'fail' }
    case 'CANCELLED':
      return { state, bucket: 'cancel' }
    default:
      return { state, bucket: 'pending' }
  }
}

/** The REST equivalent of `gh pr checks <pr> --json CHECK_FIELDS`. */
export async function fetchPrChecksRest(
  pr: number,
  opts: FetchOptions
): Promise<PrCheck[]> {
  return (await fetchPrChecksRestFull(pr, opts)).checks
}

/**
 * One read of the pull request per poll (#2905): its head SHA picks the
 * check-runs, and the same read gives the merge state, so the two can't
 * disagree about which commit they describe.
 */
async function fetchPrChecksRestFull(
  pr: number,
  opts: FetchOptions
): Promise<ChecksRead> {
  const gh = { runner: opts.runner, sleep: opts.sleep }
  const base = `repos/${opts.repo}`
  const pull = await runGhJson<RestPull>(['api', `${base}/pulls/${pr}`], gh)
  const sha = pull.head.sha
  const runs = await fetchAllPages<RestCheckRun>(
    `${base}/commits/${sha}/check-runs`,
    'check_runs',
    opts
  )
  if (runs.length === 0) return { checks: [], pull }
  const workflows = await fetchAllPages<WorkflowRun>(
    `${base}/actions/runs?head_sha=${sha}`,
    'workflow_runs',
    opts
  )
  const workflowBySuite = new Map(
    workflows.map(w => [w.check_suite_id, w.name ?? ''])
  )
  const checks = runs.map(run => ({
    name: run.name,
    ...restCheckState(run),
    link: run.details_url ?? run.html_url ?? '',
    workflow: workflowBySuite.get(run.check_suite?.id ?? -1) ?? '',
    startedAt: run.started_at ?? '',
    completedAt: run.completed_at ?? '',
  }))
  return {
    checks: dropSupersededRunChecks(checks, workflows),
    pull,
    workflowRuns: workflows,
  }
}

/** The workflow run id in a check's job URL: `/actions/runs/<id>/job/<id>`. */
function runIdOf(link: string): number | undefined {
  const m = /\/actions\/runs\/(\d+)(?:\/|$)/.exec(link)
  return m ? Number(m[1]) : undefined
}

/**
 * Drop the rows of a run that a newer run of the same workflow replaced on
 * this head commit (#2935). A run cancelled before its matrix expanded keeps
 * literal job names (`Smoke (${{ matrix.shard }})`) that never match the
 * newer run's expanded ones, so name-based folding can't retire them. Uses
 * the workflow runs already read for the check names: no extra API call.
 *
 * Fails closed: the newer run must have produced a verdict (a row that isn't
 * skipped), or an all-skipped no-op run would hide a real cancelled run. A
 * newer cancelled or pending run still counts, and its own rows stay.
 */
export function dropSupersededRunChecks(
  checks: PrCheck[],
  runs: WorkflowRun[]
): PrCheck[] {
  const created = (r: WorkflowRun) => r.created_at ?? ''
  const byId = new Map(
    runs.filter(r => r.id !== undefined).map(r => [r.id as number, r])
  )
  const hasVerdict = new Set<number>()
  for (const c of checks) {
    const id = runIdOf(c.link)
    if (id !== undefined && c.bucket !== 'skipping') hasVerdict.add(id)
  }
  const newer = (a: WorkflowRun, b: WorkflowRun) =>
    created(a) > created(b) || (created(a) === created(b) && a.id! > b.id!)
  const superseded = (run: WorkflowRun) =>
    runs.some(
      o =>
        o.id !== undefined &&
        o.id !== run.id &&
        (o.name ?? '') === (run.name ?? '') &&
        hasVerdict.has(o.id) &&
        newer(o, run)
    )
  return checks.filter(c => {
    const id = runIdOf(c.link)
    const run = id === undefined ? undefined : byId.get(id)
    return !run || !superseded(run)
  })
}

/**
 * The PR's merge state (#2905). Green checks alone can lag: a title or body
 * edit starts a new CI run whose gate isn't in the check list yet, while
 * GitHub already shows the PR BLOCKED. `status` is GraphQL's
 * `mergeStateStatus` (CLEAN, BLOCKED, BEHIND, DIRTY, DRAFT, HAS_HOOKS,
 * UNSTABLE, UNKNOWN), or the REST `mergeable_state` upper-cased, which uses
 * the same words.
 */
export interface MergeState {
  status: string
  headSha: string
  /**
   * The PR is a draft. GitHub can report CLEAN for a draft (PR #2911), so
   * this is read on its own and a draft is never mergeable (#2910).
   */
  draft: boolean
}

/** What the verdict on a merge state may depend on besides the state. */
export interface VerdictContext {
  allowCancelled: boolean
  /** Number of cancelled checks in the latest summary. */
  cancelled: number
}

/** Merge states that let a PR pass: mergeable, a draft, or already finished. */
const PASSING_STATES = new Set([
  'CLEAN',
  'HAS_HOOKS',
  'DRAFT',
  'MERGED',
  'CLOSED',
])

/**
 * UNSTABLE means a non-required check is failing or still pending, which
 * can be a newer run that isn't listed yet. It only passes when the caller
 * chose to ignore cancelled checks and one of them is the reason.
 */
function unstableIsExpected(ctx: VerdictContext): boolean {
  return ctx.allowCancelled && ctx.cancelled > 0
}

export function mergeStateVerdict(
  status: string,
  ctx: VerdictContext,
  draft = false
): 'ok' | 'conflict' | 'waiting' {
  if (PASSING_STATES.has(status)) return 'ok'
  // A draft can't be merged, so what blocks a merge (BLOCKED, BEHIND, ...)
  // isn't a reason to wait; only a conflict is still worth reporting (#2910).
  if (draft && status !== 'DIRTY') return 'ok'
  if (status === 'UNSTABLE' && unstableIsExpected(ctx)) return 'ok'
  return status === 'DIRTY' ? 'conflict' : 'waiting'
}

/**
 * True only when GitHub would let the PR merge now. A draft passes ci-wait
 * (drafts are expected in this flow) but isn't mergeable; neither is a
 * merged or closed PR.
 */
export function isMergeable(status: string, ctx: VerdictContext): boolean {
  return (
    status === 'CLEAN' ||
    status === 'HAS_HOOKS' ||
    (status === 'UNSTABLE' && unstableIsExpected(ctx))
  )
}

function mergeStateFromPull(pull: RestPull): MergeState {
  return {
    status:
      pull.state === 'closed'
        ? 'CLOSED'
        : (pull.mergeable_state ?? 'unknown').toUpperCase(),
    headSha: pull.head?.sha ?? '',
    draft: pull.draft === true,
  }
}

/**
 * `gh pr view --json mergeStateStatus,headRefOid`, or, where GraphQL is
 * blocked (cloud sessions, 403; #2485), the REST pull request's
 * `mergeable_state`. Fields: GET /repos/{owner}/{repo}/pulls/{pull_number}
 * https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request
 * (`mergeable_state`: clean, blocked, behind, dirty, unstable, draft,
 * has_hooks, unknown; `head.sha`). REST computes it lazily, so a first read
 * can say `unknown`; ci-wait treats that as still waiting.
 */
export async function fetchMergeState(
  pr: number,
  opts: FetchOptions
): Promise<MergeState> {
  const gh = { runner: opts.runner, sleep: opts.sleep }
  try {
    const v = await runGhJson<{
      mergeStateStatus?: string
      headRefOid?: string
      state?: string
      isDraft?: boolean
    }>(
      [
        'pr',
        'view',
        String(pr),
        '--repo',
        opts.repo,
        '--json',
        'mergeStateStatus,headRefOid,state,isDraft',
      ],
      gh
    )
    return {
      // A merged or closed PR has no merge state (GitHub says UNKNOWN).
      status:
        v.state === 'MERGED' || v.state === 'CLOSED'
          ? v.state
          : (v.mergeStateStatus ?? 'UNKNOWN').toUpperCase(),
      headSha: v.headRefOid ?? '',
      draft: v.isDraft === true,
    }
  } catch (err) {
    if (!(err instanceof CommandError && isGraphQlBlocked(err))) throw err
  }
  return mergeStateFromPull(
    await runGhJson<RestPull>(['api', `repos/${opts.repo}/pulls/${pr}`], gh)
  )
}

/** Workflow-run statuses that mean the run has not finished (#2910). */
const UNFINISHED_RUN_STATUSES = new Set([
  'queued',
  'in_progress',
  'waiting',
  'requested',
  'pending',
])

/** A workflow run for the head commit that has not finished. */
export interface ActiveRun {
  name: string
  status: string
  url: string
}

/** Events whose runs belong to a pull request's checks (#2910). */
const PR_EVENTS = new Set(['pull_request', 'pull_request_target'])

/**
 * The unfinished runs among a commit's workflow runs that belong to this PR
 * (#2910): the event is pull_request or pull_request_target and the run lists
 * the PR. A `gh workflow run` dispatch on the same SHA, or a run on another
 * PR with the same head, doesn't hold this PR back.
 */
export function activeRunsFor(
  rows: Array<Omit<WorkflowRun, 'check_suite_id'>>,
  pr: number
): ActiveRun[] {
  return rows
    .filter(
      r =>
        UNFINISHED_RUN_STATUSES.has(r.status ?? '') &&
        PR_EVENTS.has(r.event ?? '') &&
        (r.pull_requests ?? []).some(p => p.number === pr)
    )
    .map(r => ({
      name: r.name ?? '(unnamed workflow)',
      status: r.status ?? '',
      url: r.html_url ?? '',
    }))
}

/**
 * The unfinished workflow runs of a PR's head commit (#2910). A run that has
 * just started (after `gh pr ready` or a push) has no check in the list yet,
 * so green checks can hide it. One read of
 * GET /repos/{owner}/{repo}/actions/runs?head_sha=<sha>&per_page=100; the
 * first page is enough, since one commit has well under 100 workflow runs.
 * Over REST the runs were already read for the check names, so ciWait reuses
 * those instead.
 * https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
 */
export async function fetchActiveRuns(
  headSha: string,
  pr: number,
  opts: FetchOptions
): Promise<ActiveRun[]> {
  const body = await runGhJson<{ workflow_runs?: WorkflowRun[] }>(
    [
      'api',
      `repos/${opts.repo}/actions/runs?head_sha=${headSha}&per_page=${PER_PAGE}`,
    ],
    { runner: opts.runner, sleep: opts.sleep }
  )
  return activeRunsFor(body.workflow_runs ?? [], pr)
}

export type CiOutcome = 'pass' | 'fail' | 'pending'

export interface CiWaitResult {
  pr: number
  outcome: CiOutcome
  timedOut: boolean
  waitedMs: number
  polls: number
  summary: CheckSummary
  /** Set once the checks are done and none failed; absent before that. */
  mergeState?: string
  /** The commit the merge state was read at. */
  headSha?: string
  /** GitHub would let the PR merge now. False for a draft. */
  mergeable?: boolean
  /** The PR is a draft (isDraft; REST: draft). */
  draft?: boolean
  /** The head moved while the checks were being confirmed. */
  headMoved?: boolean
  /** Workflow runs for the head commit that haven't finished (#2910). */
  activeRuns?: ActiveRun[]
}

export interface CiWaitOptions extends FetchOptions {
  intervalMs?: number
  timeoutMs?: number
  /** Evaluate once, don't wait. */
  once?: boolean
  /** Return as soon as any check fails. */
  failFast?: boolean
  /** Don't count a cancelled check as a failure. */
  allowCancelled?: boolean
  now?: () => number
  onProgress?: (s: CheckSummary) => void
  /**
   * Check the GitHub rate limit before polling (refuse under 500 calls left)
   * and stop, without retrying, if a response says the limit is hit (#2892).
   */
  guardRateLimit?: boolean
}

function isFailing(s: CheckSummary, allowCancelled: boolean): boolean {
  return s.failed > 0 || (!allowCancelled && s.cancelled > 0)
}

export async function ciWait(
  pr: number,
  opts: CiWaitOptions
): Promise<CiWaitResult> {
  const now = opts.now ?? Date.now
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  const interval = opts.intervalMs ?? MIN_INTERVAL_MS
  const timeout = opts.timeoutMs ?? 60 * 60_000
  const allowCancelled = opts.allowCancelled ?? false
  let runner = opts.runner
  if (opts.guardRateLimit) {
    // A single --once snapshot is one cheap read; only a long wait needs the
    // budget. CI's GITHUB_TOKEN allows only 1,000 an hour, so a floor of 500
    // would flake the smoke (#2892).
    if (!opts.once) await assertRateLimitBudget(runner, now())
    runner = rateLimitAware(runner, now)
  }
  const started = now()
  let polls = 0
  for (;;) {
    const fo = { ...opts, runner, sleep }
    let read = await fetchPrChecksFull(pr, fo)
    let summary = summarizeChecks(read.checks)
    polls++
    opts.onProgress?.(summary)
    let merge: MergeState | undefined
    let headMoved = false
    if (summary.done && !isFailing(summary, allowCancelled)) {
      // Green checks are not enough (#2905): GitHub must also allow a merge,
      // and the head must not move while we confirm it. Over REST one read
      // of the pull request gave both. Over GraphQL the checks carry no SHA,
      // so read the head, then the checks again, then the head: if the two
      // heads agree, the checks were read at that commit.
      if (read.pull) {
        merge = mergeStateFromPull(read.pull)
      } else {
        const before = await fetchMergeState(pr, fo)
        read = await fetchPrChecksFull(pr, fo)
        summary = summarizeChecks(read.checks)
        merge = read.pull
          ? mergeStateFromPull(read.pull)
          : await fetchMergeState(pr, fo)
        headMoved = before.headSha !== merge.headSha
      }
    }
    const failing = isFailing(summary, allowCancelled)
    const ctx: VerdictContext = {
      allowCancelled,
      cancelled: summary.cancelled,
    }
    const confirmed = summary.done && !failing ? merge : undefined
    // A run that has just started has no check yet (#2910): once the merge
    // state would pass, look for unfinished runs on this commit, once.
    let activeRuns: ActiveRun[] = []
    if (
      confirmed &&
      !headMoved &&
      confirmed.headSha &&
      confirmed.status !== 'MERGED' &&
      confirmed.status !== 'CLOSED' &&
      mergeStateVerdict(confirmed.status, ctx, confirmed.draft) === 'ok'
    ) {
      activeRuns = read.workflowRuns
        ? activeRunsFor(read.workflowRuns, pr)
        : await fetchActiveRuns(confirmed.headSha, pr, fo)
    }
    const finish = (outcome: CiOutcome, timedOut = false): CiWaitResult => ({
      pr,
      outcome,
      timedOut,
      waitedMs: now() - started,
      polls,
      summary,
      ...(confirmed && {
        mergeState: confirmed.status,
        headSha: confirmed.headSha,
        mergeable:
          !headMoved &&
          !confirmed.draft &&
          activeRuns.length === 0 &&
          isMergeable(confirmed.status, ctx),
        ...(confirmed.draft && { draft: true }),
        ...(headMoved && { headMoved }),
      }),
      ...(activeRuns.length > 0 && { activeRuns }),
    })
    if (summary.done && failing) return finish('fail')
    if (confirmed && !headMoved) {
      const verdict = mergeStateVerdict(confirmed.status, ctx, confirmed.draft)
      if (verdict === 'ok' && activeRuns.length === 0) return finish('pass')
      if (verdict === 'conflict') return finish('fail')
    }
    if (opts.failFast && summary.failed > 0) return finish('fail')
    if (opts.once) return finish('pending')
    if (now() - started + interval > timeout) return finish('pending', true)
    await sleep(interval)
  }
}

export function ciWaitExitCode(r: CiWaitResult): number {
  return r.outcome === 'pass' ? 0 : r.outcome === 'fail' ? 1 : 2
}

function line(c: PrCheck): string {
  const wf = c.workflow ? `${c.workflow} / ` : ''
  return `  ✗ ${wf}${c.name} (${c.state.toLowerCase()}) ${c.link}`
}

export function formatCiWait(r: CiWaitResult): string {
  const s = r.summary
  const head =
    `PR #${r.pr}: ${r.outcome.toUpperCase()}` +
    (r.timedOut ? ' (timed out waiting)' : '') +
    ` — ${s.passed} passed, ${s.failed} failed, ${s.cancelled} cancelled, ` +
    `${s.pending} pending, ${s.skipped} skipped` +
    (r.mergeState ? `, merge state ${r.mergeState}` : '')
  const out = [head]
  if (r.headMoved) {
    out.push('all checks passed, but the head commit moved while confirming')
  } else if (r.mergeState === 'DIRTY') {
    out.push('merge conflicts: rebase or merge main into the branch')
  } else if ((r.draft || r.mergeState === 'DRAFT') && r.outcome === 'pass') {
    out.push('draft: not mergeable yet')
  } else if (r.activeRuns?.length && r.outcome === 'pending') {
    out.push(
      'all checks passed, but a workflow run for this commit has not finished'
    )
  } else if (r.mergeState && r.outcome === 'pending') {
    out.push(
      `all checks passed, but GitHub reports the PR as ${r.mergeState}` +
        ' (a newer run or a required review may still be outstanding)'
    )
  }
  if (s.failures.length) out.push('failed:', ...s.failures.map(line))
  if (s.cancelledChecks.length)
    out.push('cancelled:', ...s.cancelledChecks.map(line))
  if (r.outcome === 'pending' && s.pendingChecks.length) {
    out.push(
      'still pending:',
      ...s.pendingChecks.map(
        c => `  … ${c.workflow ? `${c.workflow} / ` : ''}${c.name}`
      )
    )
  }
  if (r.outcome === 'pending' && r.activeRuns?.length) {
    out.push(
      'unfinished workflow runs:',
      ...r.activeRuns.map(
        a =>
          `  … ${a.name} (${a.status === 'waiting' ? 'waiting for approval' : a.status}) ${a.url}`
      )
    )
  }
  if (s.failures.length) {
    out.push('next: ./bin/agent-cli job-log <job URL above>')
  }
  return out.join('\n')
}
