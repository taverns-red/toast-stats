/**
 * CI Gate — pure aggregator logic (#1216).
 *
 * `main`'s ruleset can only usefully require ONE status check, because every
 * real CI workflow in this repo is path-filtered:
 *
 *   - `ci.yml` has `paths-ignore:` for markdown/tasks/docs/.gitignore/LICENSE
 *   - `docs.yml` has the mirror-image `paths:` allowlist
 *
 * Requiring `Test Suite` directly deadlocks every docs-only PR (the check
 * never reports, so it sits "Expected" forever and the sprint-runner can never
 * merge). Requiring `Docs Gate` deadlocks every code-only PR, symmetrically.
 *
 * So the required check is an aggregator — `CI Gate` — that runs
 * UNCONDITIONALLY (no path filter of its own, enforced by a drift guard in
 * this module's test suite) and decides. Its contract:
 *
 *   1. Derive the EXPECTED set of check names from the PR's changed files,
 *      using the same non-code classifier the git hooks use
 *      ({@link isDocsOnly} / {@link isNonCodeFile} in `changedFilesGate.ts`,
 *      which mirrors the workflow path filters).
 *   2. Compare that expectation against the check runs actually reported for
 *      the head SHA.
 *   3. FAIL CLOSED ON ABSENCE. An expected check with no check run at all is
 *      a failure, not a pass.
 *
 * Point 3 is the whole reason this exists. On 2026-08-31 PR #1484 reported
 * `mergeState: CLEAN` with ZERO check suites registered — no workflow ever
 * scheduled — and was mergeable. A gate that only inspects what is present
 * cannot tell "all checks passed" from "no checks ran".
 *
 * The two cases this module deliberately separates:
 *
 *   - LEGITIMATELY SKIPPED — the diff falls entirely inside a workflow's path
 *     filter, so that workflow is *supposed* to be absent. Its checks are
 *     never placed in `expected`, so their absence is silent and fine. A
 *     docs-only PR expects `Docs Gate` and nothing from `ci.yml`.
 *   - NEVER SCHEDULED — the diff says a workflow must run, and no check run
 *     for it exists. It lands in `missing`, which is `pending` while polling
 *     and a hard failure at the deadline. This is the #1484 case.
 *
 * A third case rounds it out: PRESENT BUT `conclusion: skipped` (a job-level
 * `if:` skip, or a job skipped because a `needs:` dependency failed). An
 * expected job that reports `skipped` is a failure — only `success` passes.
 * Two exceptions, both because a skip there is not the job's verdict:
 * a skipped run beside a green one is ignored (#2204), and a check whose only
 * runs are skipped stays `pending` while another workflow run on the head SHA
 * is still queued or in progress — that run may yet report it for real
 * (#2219). "In flight" is read from the workflow-run listing OR from any
 * non-gate check run on the head that has not completed (the listing alone
 * missed a running Test Suite on PR #2240). Once nothing on the head is still
 * running, skipped-only fails.
 */

import { isDocsOnly, isNonCodeFile } from './changedFilesGate'

/** Job names in `ci.yml` that a code-touching PR must see green. */
export const CI_CHECKS = [
  'Quality Gates',
  'Test Suite',
  'Build Applications',
] as const

/** The job name in `docs.yml`. */
export const DOCS_CHECK = 'Docs Gate'

/** The aggregator's own job name — the single required check on `main`. */
export const GATE_CHECK = 'CI Gate'

/** One check run as reported by `GET /commits/{sha}/check-runs`. */
export interface ObservedCheck {
  name: string
  /** `queued` | `in_progress` | `completed` (GitHub also emits `waiting`). */
  status: string
  /** `success` | `failure` | `skipped` | `cancelled` | … | `null` if running. */
  conclusion: string | null
}

/**
 * One workflow run as reported by `GET /repos/{repo}/actions/runs?head_sha=`,
 * trimmed to the fields the gate reads.
 */
export interface ObservedWorkflowRun {
  id: number
  /** The workflow's `name:` (e.g. `CI`, `Docs`, `CI Gate`). */
  name: string
  /** `queued` | `in_progress` | `completed` (also `waiting`, `pending`, …). */
  status: string
}

/** The aggregator's own workflow name (same string as its job name). */
const GATE_WORKFLOW = GATE_CHECK

/**
 * True when some workflow run on the head SHA, other than a CI Gate run, has
 * not completed yet — so a required check may still be reported (#2219).
 *
 * The gate's own run is always in progress while it polls, and a superseded
 * gate run never produces a required check, so every `CI Gate` run (and the
 * caller's own run id, belt and braces) is excluded.
 *
 * A listing that does not contain the gate's own run is incomplete, so it
 * counts as in flight. The endpoint intermittently answers 200 with
 * `total_count: 0` for a head that has runs (7 of 16 reads of PR #2240's head
 * on 2026-10-22), and that is how CI Gate run 39810475356 failed. Waiting is
 * the safe side: the gate's deadline still bounds it.
 */
export function workflowRunsInFlight(
  runs: ObservedWorkflowRun[],
  selfRunId: number
): boolean {
  if (selfRunId > 0 && !runs.some(r => r.id === selfRunId)) return true
  return runs.some(
    r =>
      r.id !== selfRunId && r.name !== GATE_WORKFLOW && r.status !== 'completed'
  )
}

export interface EvaluateOptions {
  /**
   * Another workflow run on the head SHA is still queued/in progress (see
   * {@link workflowRunsInFlight}). Turns a skipped-only check from a failure
   * into `pending`. A non-gate check in `observed` that has not completed
   * has the same effect on its own. Defaults to `false`.
   */
  runsInFlight?: boolean
}

export type GateState = 'pass' | 'fail' | 'pending'

export interface GateVerdict {
  state: GateState
  /** Expected, present, and concluded `success`. */
  satisfied: string[]
  /** Expected, present, still running — poll again. */
  pending: string[]
  /** Expected, NO check run at all — the #1484 signature. */
  missing: string[]
  /** Expected, present, concluded something other than `success`. */
  failed: { name: string; conclusion: string }[]
}

/**
 * The check names that MUST be present and green for this set of changed
 * files. Derived from the diff, never from what happens to be reported —
 * that inversion is what makes absence detectable.
 *
 * - Docs-only diff → `['Docs Gate']` (ci.yml legitimately skipped).
 * - Code-only diff → the three `ci.yml` jobs (docs.yml legitimately skipped).
 * - Mixed diff → both workflows run, so both are expected.
 * - Empty list → the `ci.yml` set. An empty/unknown diff must not be a free
 *   pass, and `isDocsOnly([])` is already `false` by the same reasoning.
 */
export function expectedChecks(files: string[]): string[] {
  if (files.length === 0) return [...CI_CHECKS]

  const expected: string[] = []
  // `paths-ignore` is ALL-not-ANY: ci.yml runs unless every file is non-code.
  if (!isDocsOnly(files)) expected.push(...CI_CHECKS)
  // `paths` is ANY: docs.yml runs if any single file matches the allowlist.
  if (files.some(isNonCodeFile)) expected.push(DOCS_CHECK)
  return expected
}

/**
 * Compare the expected check names against the observed check runs.
 *
 * `pending` and `missing` are both non-terminal while the poller still has
 * time on the clock; the caller converts a deadline expiry into a failure (see
 * {@link isDeadlineFailure}). `failed` is terminal immediately — there is no
 * point waiting on `Build Applications` once `Test Suite` is red.
 *
 * An empty `expected` set is a bug in the caller, not a pass: it means the
 * classifier produced no expectation at all, so it fails closed.
 */
export function evaluateChecks(
  expected: string[],
  observed: ObservedCheck[],
  { runsInFlight = false }: EvaluateOptions = {}
): GateVerdict {
  const verdict: GateVerdict = {
    state: 'pending',
    satisfied: [],
    pending: [],
    missing: [],
    failed: [],
  }

  if (expected.length === 0) {
    verdict.state = 'fail'
    verdict.failed.push({ name: '(no expectation)', conclusion: 'empty' })
    return verdict
  }

  // A non-gate check run that is still going proves a workflow run on the head
  // is in flight, whatever the workflow-run listing says. On PR #2240 the
  // listing read in the same poll reported nothing in flight while Test Suite
  // was visibly in progress, and Build Applications (blocked on it) failed as
  // skipped-only (#2219). The gate's own check is always running, so skip it.
  const inFlight =
    runsInFlight ||
    observed.some(c => c.name !== GATE_CHECK && c.status !== 'completed')

  for (const name of expected) {
    const runs = observed.filter(c => c.name === name)
    if (runs.length === 0) {
      verdict.missing.push(name)
      continue
    }
    if (runs.some(r => r.status !== 'completed')) {
      verdict.pending.push(name)
      continue
    }
    // A `skipped` run beside a green one is a no-op re-schedule, not a verdict:
    // a body-only `pull_request: edited` re-triggers ci.yml/docs.yml with every
    // job `if:`-skipped (#2204). The green run already proved this head SHA.
    // A check whose ONLY runs are skipped still fails below.
    const hasGreen = runs.some(r => r.conclusion === 'success')
    const bad = runs.filter(
      r =>
        r.conclusion !== 'success' && !(hasGreen && r.conclusion === 'skipped')
    )
    const skippedOnly =
      bad.length > 0 && bad.every(r => r.conclusion === 'skipped')
    // Skipped-only while another run on the head is still going is not a
    // verdict yet: on #2212 a no-op `edited` CI run finished all-skipped
    // before the real run had created its jobs (#2219). The deadline still
    // bounds the wait.
    if (skippedOnly && inFlight) {
      verdict.pending.push(name)
      continue
    }
    // Report a real failure ahead of a skip when both are present.
    const worst = bad.find(r => r.conclusion !== 'skipped') ?? bad[0]
    if (worst) {
      // `skipped` lands here on purpose: an EXPECTED job must actually run.
      verdict.failed.push({ name, conclusion: worst.conclusion ?? 'unknown' })
      continue
    }
    verdict.satisfied.push(name)
  }

  if (verdict.failed.length > 0) verdict.state = 'fail'
  else if (verdict.missing.length > 0 || verdict.pending.length > 0)
    verdict.state = 'pending'
  else verdict.state = 'pass'

  return verdict
}

/**
 * True when a still-`pending` verdict has run out of clock and must become a
 * failure. Separated from {@link evaluateChecks} so the time-dependent half
 * stays out of the pure comparison.
 */
export function isDeadlineFailure(
  verdict: GateVerdict,
  deadlineExceeded: boolean
): boolean {
  return (
    verdict.state === 'fail' || (deadlineExceeded && verdict.state !== 'pass')
  )
}

/**
 * One-line human summary for the job log / step summary.
 *
 * `missing` is labelled by what it MEANS at this point in the poll, not by the
 * field name. Mid-poll, an absent check is usually a job GitHub has not created
 * a check run for yet (`Build Applications` is blocked on
 * `needs: [quality-gates, test]` for most of a run) — calling that
 * "NOT SCHEDULED" every 20 seconds trains the reader to ignore the words that
 * matter. Pass `terminal` on the last line, where the absence IS the diagnosis.
 */
export function describeVerdict(
  verdict: GateVerdict,
  terminal = false
): string {
  const parts = [`state=${verdict.state}`]
  if (verdict.satisfied.length)
    parts.push(`ok=[${verdict.satisfied.join(', ')}]`)
  if (verdict.pending.length)
    parts.push(`running=[${verdict.pending.join(', ')}]`)
  if (verdict.missing.length) {
    const label = terminal ? 'NOT SCHEDULED' : 'not-yet-reported'
    parts.push(`${label}=[${verdict.missing.join(', ')}]`)
  }
  if (verdict.failed.length)
    parts.push(
      `failed=[${verdict.failed.map(f => `${f.name}:${f.conclusion}`).join(', ')}]`
    )
  return parts.join(' ')
}

/** Knobs for {@link getJsonWithRetry}; every field has a default. */
export interface RetryOptions {
  /** Total tries, including the first. Default 3. */
  attempts?: number
  /** Wait before the 2nd try; doubles each retry. Default 2000 ms. */
  baseDelayMs?: number
  /** Injected for tests. Defaults to a real `setTimeout` wait. */
  sleep?: (ms: number) => Promise<void>
  /**
   * Time left on the gate's own deadline. A retry whose wait would not fit is
   * not attempted, so retrying never stretches the overall budget (#2261).
   */
  remainingMs?: () => number
}

/**
 * True for a response worth trying again: any 5xx, a 429, or a 403 that
 * GitHub marks as rate limiting (`x-ratelimit-remaining: 0`). Every other 4xx
 * is a real answer (bad path, missing permission) and fails fast.
 */
export function isRetryableResponse(res: Response): boolean {
  if (res.status >= 500) return true
  if (res.status === 429) return true
  return res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0'
}

/**
 * GET `url` and parse JSON, retrying transient failures (#2261).
 *
 * CI Gate run 39985288980 was polling a healthy PR when one HTTP 500 from the
 * check-runs endpoint threw out of the loop and turned the PR red. A 5xx, a
 * rate limit, or a network error (fetch rejects) is now retried with
 * exponential backoff, up to `attempts` tries in all. Anything else fails on
 * the first answer.
 *
 * The wait before a retry must fit inside `remainingMs()`; when it does not,
 * the last error is thrown instead. The gate's deadline is the budget and a
 * retry never extends it.
 */
export async function getJsonWithRetry<T>(
  doFetch: (url: string) => Promise<Response>,
  url: string,
  {
    attempts = 3,
    baseDelayMs = 2000,
    sleep = ms => new Promise(r => setTimeout(r, ms)),
    remainingMs = () => Infinity,
  }: RetryOptions = {}
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let error: Error
    try {
      const res = await doFetch(url)
      if (res.ok) return (await res.json()) as T
      error = new Error(`GET ${url} -> ${res.status} ${await res.text()}`)
      if (!isRetryableResponse(res)) throw new FailFast(error)
    } catch (err) {
      if (err instanceof FailFast) throw err.cause
      // fetch rejects only on a network failure (DNS, reset, timeout).
      error = err instanceof Error ? err : new Error(String(err))
    }
    const delay = baseDelayMs * 2 ** (attempt - 1)
    if (attempt >= attempts || delay > remainingMs()) throw error
    console.error(
      `⚠️  ${error.message} — retry ${attempt}/${attempts - 1} in ${delay}ms`
    )
    await sleep(delay)
  }
}

/** Carries a non-retryable HTTP error past the network-error catch. */
class FailFast {
  constructor(readonly cause: Error) {}
}
