/**
 * The verdict on an unrelated label event (#2865, review F1).
 *
 * pr-preview.yml runs on `labeled` events. For a label other than
 * `preview-smoke` nothing is deployed or tested, so the verdict cannot be
 * recomputed from this run's needs. If it were skipped it would count as
 * passing for branch protection and could clear an earlier FAILED verdict on
 * the same head. So it mirrors the newest real `PR Preview verdict` job on
 * the head instead: a skipped job is not a real one, and the newest real one
 * must be completed and `success`. Same shape as `evaluateHeadChecks` in
 * ciGateNeeds.ts (#2859).
 */

export const VERDICT_JOB_NAME = 'PR Preview verdict'

export interface VerdictJob {
  name: string
  status: string
  conclusion: string | null
  started_at?: string | null
  id?: number
}

export interface MirrorVerdict {
  pass: boolean
  reasons: string[]
}

function isNewer(b: VerdictJob, a: VerdictJob): boolean {
  const tb = b.started_at ? Date.parse(b.started_at) : NaN
  const ta = a.started_at ? Date.parse(a.started_at) : NaN
  if (!Number.isNaN(tb) && !Number.isNaN(ta) && tb !== ta) return tb > ta
  return (b.id ?? 0) > (a.id ?? 0)
}

/**
 * `jobs` are the verdict jobs of the OTHER runs on this head (the caller
 * excludes the current run); other job names are ignored here too.
 */
export function mirrorVerdict(jobs: VerdictJob[]): MirrorVerdict {
  const real = jobs.filter(
    j =>
      j.name === VERDICT_JOB_NAME &&
      !(j.status === 'completed' && j.conclusion === 'skipped')
  )
  if (real.length === 0)
    return {
      pass: false,
      reasons: [
        `no earlier non-skipped ${VERDICT_JOB_NAME} on this head to mirror`,
      ],
    }
  const latest = real.reduce((a, b) => (isNewer(b, a) ? b : a))
  if (latest.status !== 'completed')
    return {
      pass: false,
      reasons: [
        `the latest ${VERDICT_JOB_NAME} is still running; re-run this check when it is done`,
      ],
    }
  if (latest.conclusion !== 'success')
    return {
      pass: false,
      reasons: [
        `the latest ${VERDICT_JOB_NAME} is ${latest.conclusion ?? 'unknown'}, expected success`,
      ],
    }
  return { pass: true, reasons: [] }
}
