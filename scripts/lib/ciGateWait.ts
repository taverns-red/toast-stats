/**
 * CI Gate no-op wait (#2881). Stub: the red commit proves the tests fail.
 */
import type { HeadCheckRun, NeedsVerdict } from './ciGateNeeds'

export const POLL_MS = 30_000

export interface GateRun {
  id: number
  status: string
  jobs: HeadCheckRun[]
}

export interface GateDecision extends NeedsVerdict {
  done: boolean
}

export interface GateState {
  headSha: string
  runs: GateRun[]
}

export function decideGate(_args: {
  expected: string[]
  runs: GateRun[]
  selfRunId: number
  headMoved: boolean
}): GateDecision {
  throw new Error('not implemented')
}

export async function waitForGate(_opts: {
  fetchState: () => Promise<GateState>
  expected: string[]
  headSha: string
  selfRunId: number
  sleep: (ms: number) => Promise<void>
  intervalMs?: number
  onWait?: (reasons: string[]) => void
}): Promise<NeedsVerdict> {
  throw new Error('not implemented')
}
