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
  observed: ObservedCheck[]
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
    const bad = runs.find(r => r.conclusion !== 'success')
    if (bad) {
      // `skipped` lands here on purpose: an EXPECTED job must actually run.
      verdict.failed.push({ name, conclusion: bad.conclusion ?? 'unknown' })
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
