/**
 * CI Gate decision from a workflow's own `needs` context (#2607 item 3).
 * Stub: implemented in the next commit.
 */
export interface NeedResult {
  result: string
  outputs?: Record<string, string>
}

export interface NeedsVerdict {
  pass: boolean
  reasons: string[]
}

export function classifyChanges(_files: string[]): {
  code: boolean
  docs: boolean
} {
  return { code: false, docs: false }
}

export function evaluateNeeds(
  _needs: Record<string, NeedResult>,
  _opts: { noop: boolean }
): NeedsVerdict {
  return { pass: false, reasons: ['not implemented'] }
}
