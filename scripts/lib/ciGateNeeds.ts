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
