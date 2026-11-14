/** Data-restore copy picker (#2539). Stub: implemented in the next commit. */

export class RestorePlanError extends Error {}

export interface ObjectCopy {
  name: string
  bucket: string
  generation: string
  timeCreated: string
  softDeleteTime?: string
  hardDeleteTime?: string
}

export interface PlanEntry {
  name: string
  action: 'restore' | 'delete' | 'noop' | 'refuse'
  liveGeneration: string
  generation?: string
  hardDeleteTime?: string
  reason: string
}

export interface RestorePlan {
  version: 1
  bucket: string
  since: string
  entries: PlanEntry[]
  refused: number
}

export function parseListing(_json: unknown): ObjectCopy[] {
  throw new Error('not implemented')
}

export function planRestore(_input: {
  live: ObjectCopy[]
  softDeleted: ObjectCopy[]
  since: string
  paths?: string[]
}): RestorePlan {
  throw new Error('not implemented')
}

export function verifyPlan(_saved: RestorePlan, _current: RestorePlan): void {
  throw new Error('not implemented')
}

export function executePlan(
  _plan: RestorePlan,
  _run: (argv: string[]) => void
): void {
  throw new Error('not implemented')
}
