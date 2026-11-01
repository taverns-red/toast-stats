/**
 * `agent-cli ci-wait <pr>` (#2418): block until a PR's checks finish, print
 * only what failed, exit non-zero on any failure. Wait-only — it reads
 * `gh pr checks --json` on an interval and never re-runs, approves or
 * merges anything.
 *
 * Replaces the hand-written `sleep N; gh pr checks; break` loops that were
 * the largest measured cost in this repo's sessions (taverns-red/ops#148).
 */
import { runGhResult, type Runner } from './exec.js'

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

/** A re-run leaves the old attempt in the list; keep the newest per check. */
export function latestPerCheck(checks: PrCheck[]): PrCheck[] {
  const latest = new Map<string, PrCheck>()
  for (const c of checks) {
    const key = `${c.workflow}\u0000${c.name}`
    const prev = latest.get(key)
    if (!prev || (c.startedAt ?? '') > (prev.startedAt ?? ''))
      latest.set(key, c)
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
 */
export async function fetchPrChecks(
  pr: number,
  opts: FetchOptions
): Promise<PrCheck[]> {
  const r = await runGhResult(
    ['pr', 'checks', String(pr), '--repo', opts.repo, '--json', CHECK_FIELDS],
    { runner: opts.runner, sleep: opts.sleep },
    res =>
      res.code === 0 ||
      res.stdout.trim().startsWith('[') ||
      /no checks reported/i.test(res.stderr)
  )
  if (!r.stdout.trim().startsWith('[')) return []
  return JSON.parse(r.stdout) as PrCheck[]
}

export type CiOutcome = 'pass' | 'fail' | 'pending'

export interface CiWaitResult {
  pr: number
  outcome: CiOutcome
  timedOut: boolean
  waitedMs: number
  polls: number
  summary: CheckSummary
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
  const interval = opts.intervalMs ?? 30_000
  const timeout = opts.timeoutMs ?? 60 * 60_000
  const allowCancelled = opts.allowCancelled ?? false
  const started = now()
  let polls = 0
  for (;;) {
    const summary = summarizeChecks(await fetchPrChecks(pr, { ...opts, sleep }))
    polls++
    opts.onProgress?.(summary)
    const failing = isFailing(summary, allowCancelled)
    const finish = (outcome: CiOutcome, timedOut = false): CiWaitResult => ({
      pr,
      outcome,
      timedOut,
      waitedMs: now() - started,
      polls,
      summary,
    })
    if (summary.done) return finish(failing ? 'fail' : 'pass')
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
    `${s.pending} pending, ${s.skipped} skipped`
  const out = [head]
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
  if (s.failures.length) {
    out.push('next: ./bin/agent-cli job-log <job URL above>')
  }
  return out.join('\n')
}
