/**
 * CI Gate decision from a workflow's own `needs` context (#2607 item 3).
 *
 * The gate is the last job of ci.yml and `needs:` every real job, so nothing
 * polls. This module turns `toJSON(needs)` into a verdict. It keeps the
 * #1216/#1484 contract the polling gate had:
 *
 *   - the EXPECTED jobs come from the diff (`changes` outputs), not from what
 *     happened to run;
 *   - an expected job must be `success`. `skipped` is a failure, because
 *     GitHub reports a skipped job as passing and a skip must never open the
 *     gate;
 *   - a job the diff does not require may be `skipped` (legitimately), and
 *     anything else from it is ignored only if it is `success`.
 */
import { isDocsOnly, isNonCodeFile } from './changedFilesGate'

export interface NeedResult {
  result: string
  outputs?: Record<string, string>
}

export interface NeedsVerdict {
  pass: boolean
  reasons: string[]
}

/** Job ids in ci.yml that a code-touching PR must see green. */
export const CODE_JOBS = ['quality-gates', 'test', 'build'] as const
/** Job id in ci.yml for the docs gate. */
export const DOCS_JOB = 'docs-gate'
/** Job id of the classifier job. */
export const CHANGES_JOB = 'changes'

/**
 * Which workflows' jobs this diff requires. Mirrors the old path filters:
 * ci jobs unless EVERY file is non-code; Docs Gate if ANY file is non-code.
 * An empty diff expects the code set: it must not be a free pass.
 */
export function classifyChanges(files: string[]): {
  code: boolean
  docs: boolean
} {
  return {
    code: files.length === 0 || !isDocsOnly(files),
    docs: files.some(isNonCodeFile),
  }
}

/** One check run on the PR head, as `GET /commits/{sha}/check-runs` reports. */
export interface HeadCheckRun {
  name: string
  status: string
  conclusion: string | null
  id?: number
  started_at?: string | null
  /** The GitHub App that reported the run (`github-actions` for workflows). */
  app?: { slug?: string } | null
}

/** The app slug GitHub reports on check runs created by workflow jobs. */
export const ACTIONS_APP_SLUG = 'github-actions'

function isNewer(b: HeadCheckRun, a: HeadCheckRun): boolean {
  const tb = b.started_at ? Date.parse(b.started_at) : NaN
  const ta = a.started_at ? Date.parse(a.started_at) : NaN
  if (!Number.isNaN(tb) && !Number.isNaN(ta) && tb !== ta) return tb > ta
  return (b.id ?? 0) > (a.id ?? 0)
}

/**
 * A title/body-only `edited` run skips every job, so its needs say nothing
 * about the head. Without this check the gate would report success on a head
 * whose real CI run failed, and GitHub takes the later `CI Gate` as the
 * verdict (canary on PR #2859: BLOCKED became CLEAN). So the gate reads the
 * head's check runs ONCE (no waiting, no polling) and, for each expected job,
 * takes the latest NON-skipped run (the edit run's own skips are noise) and
 * requires it present, completed and `success`. A run still in flight fails:
 * the real run's own `CI Gate` reports later and becomes the latest.
 */
export function evaluateHeadChecks(
  expectedNames: string[],
  runs: HeadCheckRun[]
): NeedsVerdict {
  if (expectedNames.length === 0)
    return { pass: false, reasons: ['no expected checks (classifier bug)'] }
  const reasons: string[] = []
  for (const name of expectedNames) {
    // Only GitHub Actions reports the real jobs; a same-named check from
    // another app must neither pin the gate red nor satisfy it.
    const same = runs.filter(
      r => r.name === name && r.app?.slug === ACTIONS_APP_SLUG
    )
    const real = same.filter(
      r => !(r.status === 'completed' && r.conclusion === 'skipped')
    )
    if (real.length === 0) {
      reasons.push(
        same.length === 0
          ? `${name} is missing on the head`
          : `${name} only has skipped runs on the head`
      )
      continue
    }
    const latest = real.reduce((a, b) => (isNewer(b, a) ? b : a))
    if (latest.status !== 'completed')
      reasons.push(
        `${name} is still running; re-run this check when it is done`
      )
    else if (latest.conclusion !== 'success')
      reasons.push(
        `${name} is ${latest.conclusion ?? 'unknown'}, expected success`
      )
  }
  return { pass: reasons.length === 0, reasons }
}

export function evaluateNeeds(
  needs: Record<string, NeedResult>,
  { noop }: { noop: boolean }
): NeedsVerdict {
  // A title/body-only edit skips every job on purpose (#2204); only the
  // title check (a step before this one) applies.
  if (noop) return { pass: true, reasons: [] }

  const reasons: string[] = []
  const changes = needs[CHANGES_JOB]
  if (changes?.result !== 'success') {
    reasons.push(
      `${CHANGES_JOB} is ${changes?.result ?? 'absent'}, expected success`
    )
    return { pass: false, reasons }
  }
  const code = changes.outputs?.code
  const docs = changes.outputs?.docs
  if (
    (code !== 'true' && code !== 'false') ||
    (docs !== 'true' && docs !== 'false')
  ) {
    reasons.push('changes outputs missing or malformed')
    return { pass: false, reasons }
  }
  if (code === 'false' && docs === 'false') {
    reasons.push('the diff expects no jobs at all (classifier bug)')
    return { pass: false, reasons }
  }

  const expected: string[] = [
    ...(code === 'true' ? CODE_JOBS : []),
    ...(docs === 'true' ? [DOCS_JOB] : []),
  ]
  for (const job of expected) {
    const got = needs[job]?.result ?? 'absent'
    if (got !== 'success') reasons.push(`${job} is ${got}, expected success`)
  }
  // A job the diff does not require must not have failed or been cancelled.
  for (const job of [...CODE_JOBS, DOCS_JOB]) {
    if (expected.includes(job)) continue
    const got = needs[job]?.result
    if (got === 'failure' || got === 'cancelled')
      reasons.push(`${job} is ${got}`)
  }
  return { pass: reasons.length === 0, reasons }
}
