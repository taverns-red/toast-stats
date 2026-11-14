/**
 * Auto-restore decisions (#2537, epic #2492). Red-phase stub: signatures
 * only; the next commit implements them.
 */

import type { RestorePlan } from './dataRestorePlan.js'

export type RestoreMode = 'off' | 'dry-run' | 'execute'
export type RestoreAction =
  | 'skip'
  | 'off'
  | 'plan-only'
  | 'execute'
  | 'refused'
  | 'plan-failed'
  | 'nothing-to-do'

export interface RestoreDecision {
  action: RestoreAction
  execute: boolean
  fileIssue: boolean
  reason: string
}

export interface IssueContext {
  mode: RestoreMode
  decision: RestoreDecision
  plan: RestorePlan | null
  runUrl: string
  failed: string
  executeOutcome?: string
  purgeOutcome?: string
  recheckUnhealthy?: string
}

export const DEFAULT_RESTORE_MODE: RestoreMode = 'execute'

export function resolveRestoreMode(raw: string | undefined): RestoreMode {
  void raw
  throw new Error('not implemented')
}

export function manifestPaths(jsonl: string): string[] {
  void jsonl
  throw new Error('not implemented')
}

export function decideRestore(input: {
  unhealthy: boolean
  mode: RestoreMode
  plan: RestorePlan | null
}): RestoreDecision {
  void input
  throw new Error('not implemented')
}

export function buildIssueTitle(action: RestoreAction): string {
  void action
  throw new Error('not implemented')
}

export function buildIssueBody(ctx: IssueContext): string {
  void ctx
  throw new Error('not implemented')
}
