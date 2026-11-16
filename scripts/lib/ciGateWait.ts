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
 *   - then decides from the newest older run that actually ran the expected
 *     jobs, with the #2859 rules (`evaluateHeadChecks`) restricted to that
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

const stop = (reason: string): GateDecision => ({
  done: true,
  pass: false,
  reasons: [reason],
})

/** True when the run executed (did not skip) at least one expected job. */
function ranExpected(run: GateRun, expected: string[]): boolean {
  return run.jobs.some(
    j =>
      expected.includes(j.name) &&
      j.app?.slug === ACTIONS_APP_SLUG &&
      !(j.status === 'completed' && j.conclusion === 'skipped')
  )
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
  const newest = older.find(r => ranExpected(r, args.expected))
  if (!newest) return stop('no earlier ci.yml run on this head ran the jobs')
  const v = evaluateHeadChecks(args.expected, newest.jobs)
  return {
    done: true,
    pass: v.pass,
    reasons: v.pass ? [] : v.reasons.map(r => `run ${newest.id}: ${r}`),
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
    const state = await opts.fetchState()
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
