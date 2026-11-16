export const VERDICT_JOB_NAME = 'PR Preview verdict'

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

/** Stub: the real logic lands in the green commit. */
export function decideMirror(_args: {
  runs: RunInfo[]
  selfRunId: number
  headMoved: boolean
}): MirrorDecision {
  return { done: true, pass: true, reasons: [] }
}

export interface MirrorState {
  headSha: string
  runs: RunInfo[]
}

/** Stub: the real loop lands in the green commit. */
export async function waitForMirror(_opts: {
  fetchState: () => Promise<MirrorState>
  headSha: string
  selfRunId: number
  sleep: (ms: number) => Promise<void>
  intervalMs?: number
  onWait?: (reasons: string[]) => void
}): Promise<MirrorVerdict> {
  return { pass: true, reasons: [] }
}
