/**
 * CI Gate on a no-op run: wait for the head's earlier ci.yml runs (#2881).
 *
 * A title/body edit starts a ci.yml run whose jobs are all skipped. GitHub
 * resolves a required check by the latest run of that name in the most
 * recently created check suite (workflow run), so this no-op run's `CI Gate`
 * becomes the verdict for the head. If it fails because the real run is still
 * in flight, that failure sticks until someone re-runs it. So the gate:
 *   - considers only runs OLDER than this one (id < this run's id) and never
 *     waits on newer ones, which will report after it;
 *   - WAITS until every older run is `completed` at run level;
 *   - then decides from the newest older run that is not a no-op (a no-op
 *     run's `Changes` job was skipped), requiring its `Changes` to be success,
 *     with the #2859 rules (`evaluateHeadChecks`) restricted to that
 *     run's jobs;
 *   - fails if the PR head moved or if there is no older run.
 * Same shape as scripts/lib/previewVerdictMirror.ts (#2880).
 */
import {
  ACTIONS_APP_SLUG,
  evaluateHeadChecks,
  type HeadCheckRun,
  type NeedsVerdict,
} from './ciGateNeeds'

/** Poll interval while older runs are still going. */
export const POLL_MS = 30_000

export interface GateRun {
  id: number
  /** Run-level status: queued, in_progress, completed, ... */
  status: string
  /** The run's own jobs; only read once the run is completed. */
  jobs: HeadCheckRun[]
}

export interface GateDecision extends NeedsVerdict {
  /** False: older runs are still going; poll again. */
  done: boolean
}

export interface GateState {
  headSha: string
  runs: GateRun[]
}

/** A workflow run as `GET /actions/workflows/{id}/runs` lists it. */
export interface RunRef {
  id: number
  run_attempt?: number
  pull_requests?: { number: number }[] | null
}

/**
 * Whether a run listed for this head SHA belongs to this PR. The runs query is
 * by SHA, so another PR on the same commit would show up too. Fork PRs report
 * an empty `pull_requests`, so an empty list is kept, not dropped.
 */
export function runBelongsToPr(run: RunRef, pr: number): boolean {
  const prs = run.pull_requests
  if (!prs || prs.length === 0) return true
  return prs.some(p => p.number === pr)
}

/**
 * A completed run's jobs change when it is re-run: the id stays, the attempt
 * does not. Key the jobs cache by both.
 */
export function jobsCacheKey(run: RunRef): string {
  return `${run.id}:${run.run_attempt ?? 1}`
}

const stop = (reason: string): GateDecision => ({
  done: true,
  pass: false,
  reasons: [reason],
})

/** The classifier job; every real run executes it, a no-op edit run skips it. */
export const CHANGES_NAME = 'Changes'

/**
 * A no-op (title/body edit) run is identified by its signature: its `Changes`
 * job was skipped. A real run whose `Changes` failed or was cancelled also
 * skips every other job, so "all expected jobs skipped" is not a safe test.
 */
function changesOf(run: GateRun): HeadCheckRun | undefined {
  return run.jobs.find(
    j => j.name === CHANGES_NAME && j.app?.slug === ACTIONS_APP_SLUG
  )
}
function isNoop(run: GateRun): boolean {
  const c = changesOf(run)
  return c?.status === 'completed' && c.conclusion === 'skipped'
}

export function decideGate(args: {
  expected: string[]
  runs: GateRun[]
  selfRunId: number
  headMoved: boolean
}): GateDecision {
  if (args.headMoved)
    return stop('the PR head moved; the run for the new head reports instead')
  const older = args.runs
    .filter(r => r.id < args.selfRunId)
    .sort((a, b) => b.id - a.id) // newest first, by creation order
  if (older.length === 0) return stop('no earlier ci.yml run on this head')
  const going = older.filter(r => r.status !== 'completed')
  if (going.length > 0)
    return {
      done: false,
      pass: false,
      reasons: [
        `waiting for run(s) ${going.map(r => r.id).join(', ')} to complete`,
      ],
    }
  // An earlier no-op run skipped everything; it says nothing about the head.
  const newest = older.find(r => !isNoop(r))
  if (!newest) return stop('no earlier ci.yml run on this head ran the jobs')
  const c = changesOf(newest)
  if (!c || c.status !== 'completed' || c.conclusion !== 'success')
    return stop(
      `run ${newest.id}: ${CHANGES_NAME} is ${c?.conclusion ?? 'missing'}, expected success`
    )
  const v = evaluateHeadChecks(args.expected, newest.jobs)
  return {
    done: true,
    pass: v.pass,
    reasons: v.pass ? [] : v.reasons.map(r => `run ${newest.id}: ${r}`),
  }
}

/** A non-2xx GitHub API response (#2887). */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** A 403 that is a rate limit, not a permission failure. */
    readonly rateLimited = false
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/**
 * Whether a poll error can never succeed on retry (#2887): a 4xx other than
 * 429 and other than a rate-limit 403, e.g. 401, 404, 422 or a permission 403.
 * Network errors, 5xx, 429 and rate limits are transient and stay retried.
 */
export function isPermanentError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const { status, rateLimited } = err as {
    status?: unknown
    rateLimited?: unknown
  }
  if (typeof status !== 'number') return false
  if (status < 400 || status >= 500 || status === 429) return false
  return !(status === 403 && rateLimited === true)
}

/**
 * Call `fn` until it succeeds, sleeping one poll interval after each failure.
 * A transient error (network, 5xx, 429, rate limit) must not pin the gate red.
 * A permanent 4xx is rethrown at once instead of polling until the job
 * timeout (#2887). The job timeout bounds the retries.
 */
export async function retryUntilOk<T>(
  fn: () => Promise<T>,
  opts: {
    sleep: (ms: number) => Promise<void>
    intervalMs?: number
    onRetry?: (message: string) => void
  }
): Promise<T> {
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (isPermanentError(err)) throw err
      opts.onRetry?.(
        `poll failed (${err instanceof Error ? err.message : err}); retrying`
      )
      await opts.sleep(opts.intervalMs ?? POLL_MS)
    }
  }
}

/**
 * Poll `fetchState` every POLL_MS until the decision is final. The caller's
 * job timeout bounds the wait; a timeout fails the job.
 */
export async function waitForGate(opts: {
  fetchState: () => Promise<GateState>
  expected: string[]
  headSha: string
  selfRunId: number
  sleep: (ms: number) => Promise<void>
  intervalMs?: number
  onWait?: (reasons: string[]) => void
}): Promise<NeedsVerdict> {
  for (;;) {
    let state: GateState
    try {
      state = await retryUntilOk(opts.fetchState, {
        sleep: opts.sleep,
        intervalMs: opts.intervalMs,
        onRetry: m => opts.onWait?.([m]),
      })
    } catch (err) {
      if (!isPermanentError(err)) throw err
      const msg = err instanceof Error ? err.message : String(err)
      return { pass: false, reasons: [`poll failed, not retrying: ${msg}`] }
    }
    const d = decideGate({
      expected: opts.expected,
      runs: state.runs,
      selfRunId: opts.selfRunId,
      headMoved: state.headSha !== opts.headSha,
    })
    if (d.done) return { pass: d.pass, reasons: d.reasons }
    opts.onWait?.(d.reasons)
    await opts.sleep(opts.intervalMs ?? POLL_MS)
  }
}
