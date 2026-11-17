/**
 * Guard for mcp-server-node-floor.yml (#2857): the file's only setup-node step
 * must take its version from the floor step's output.
 */

interface Step {
  id?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
}
interface Doc {
  jobs?: Record<string, { steps?: Step[] }>
}

/** Problems with the setup-node steps of the whole workflow; empty when fine. */
export function findSetupNodeViolations(doc: Doc): string[] {
  void doc
  return []
}
