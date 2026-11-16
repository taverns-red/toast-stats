/**
 * The verdict on an unrelated label event (#2865).
 *
 * pr-preview.yml runs on `labeled` events. For a label other than
 * `preview-smoke` nothing is deployed or tested, so the verdict cannot be
 * recomputed from this run's needs. A skipped verdict would count as passing
 * and could clear an earlier FAILED one on the same head, so it mirrors the
 * real verdict instead.
 *
 * GitHub resolves a required check by the latest run of that name in the most
 * recently created check suite (workflow run). So this verdict:
 *   - considers only runs OLDER than this one (id < this run's id) and never
 *     waits on newer ones, which will report after it;
 *   - WAITS until every older run is completed, rather than failing on one
 *     still going (that would pin the check red for a label added mid-run);
 *   - mirrors the verdict job of the newest older run by run id (creation
 *     order, not job start time), skipping runs whose verdict was skipped;
 *   - fails if the PR head moved, if no older run exists, or if every older
 *     verdict was skipped.
 * Same shape as `evaluateHeadChecks` in ciGateNeeds.ts (#2859).
 */

export const VERDICT_JOB_NAME = 'PR Preview verdict'

/** Poll interval while older runs are still going. */
export const POLL_MS = 30_000

export interface VerdictJob {
  name: string
  status: string
  conclusion: string | null
  started_at?: string | null
  id?: number
}

export interface RunInfo {
  id: number
  /** Run-level status: queued, in_progress, completed, ... */
  status: string
  /** The run's verdict jobs; only read once the run is completed. */
  verdictJobs: VerdictJob[]
}

export interface MirrorVerdict {
  pass: boolean
  reasons: string[]
}

export interface MirrorDecision extends MirrorVerdict {
  /** False: older runs are still going; poll again. */
  done: boolean
}

const stop = (reason: string): MirrorDecision => ({
  done: true,
  pass: false,
  reasons: [reason],
})

export function decideMirror(args: {
  runs: RunInfo[]
  selfRunId: number
  headMoved: boolean
}): MirrorDecision {
  if (args.headMoved)
    return stop('the PR head moved; the run for the new head reports instead')
  const older = args.runs
    .filter(r => r.id < args.selfRunId)
    .sort((a, b) => b.id - a.id) // newest first, by creation order
  if (older.length === 0)
    return stop('no earlier pr-preview.yml run on this head to mirror')
  const going = older.filter(r => r.status !== 'completed')
  if (going.length > 0)
    return {
      done: false,
      pass: false,
      reasons: [
        `waiting for run(s) ${going.map(r => r.id).join(', ')} to complete`,
      ],
    }
  for (const r of older) {
    const real = r.verdictJobs.filter(
      j =>
        j.name === VERDICT_JOB_NAME &&
        !(j.status === 'completed' && j.conclusion === 'skipped')
    )
    if (real.length === 0) continue
    const job = real[real.length - 1]!
    if (job.status === 'completed' && job.conclusion === 'success')
      return { done: true, pass: true, reasons: [] }
    return stop(
      `the newest real ${VERDICT_JOB_NAME} (run ${r.id}) is ${job.conclusion ?? job.status}, expected success`
    )
  }
  return stop(`no earlier non-skipped ${VERDICT_JOB_NAME} on this head`)
}

export interface MirrorState {
  headSha: string
  runs: RunInfo[]
}

/**
 * Poll `fetchState` every POLL_MS until the decision is final. The caller's
 * job timeout bounds the wait; a timeout fails the job.
 */
export async function waitForMirror(opts: {
  fetchState: () => Promise<MirrorState>
  headSha: string
  selfRunId: number
  sleep: (ms: number) => Promise<void>
  intervalMs?: number
  onWait?: (reasons: string[]) => void
}): Promise<MirrorVerdict> {
  for (;;) {
    const state = await opts.fetchState()
    const d = decideMirror({
      runs: state.runs,
      selfRunId: opts.selfRunId,
      headMoved: state.headSha !== opts.headSha,
    })
    if (d.done) return { pass: d.pass, reasons: d.reasons }
    opts.onWait?.(d.reasons)
    await opts.sleep(opts.intervalMs ?? POLL_MS)
  }
}
