/**
 * Guard for mcp-server-node-floor.yml (#2857): the file's only setup-node step
 * must take its version from the floor step's output.
 *
 * ciConfigGuard.test.ts and nodeVersionPolicy.test.ts skip that whole file
 * (they require `.nvmrc`, which is the opposite of what it is for), so this is
 * the only check on its setup-node steps. It covers every job, not just the
 * first step it finds.
 *
 * The floor itself is parsed by `engineFloor` in
 * scripts/mcp-server-node-floor.mjs. `engineFloorMajor` in ciConfigGuard.ts
 * reads the same `engines.node` field as a number for the repo's policy tests;
 * both accept only a plain `>=N` range.
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

const SETUP_NODE = /^actions\/setup-node@/

/** Problems with the setup-node steps of the whole workflow; empty when fine. */
export function findSetupNodeViolations(doc: Doc): string[] {
  const violations: string[] = []
  let count = 0
  for (const [job, def] of Object.entries(doc.jobs ?? {})) {
    const steps = def.steps ?? []
    steps.forEach((step, i) => {
      if (!SETUP_NODE.test(step.uses ?? '')) return
      count++
      const w = step.with ?? {}
      if (w['node-version-file'] !== undefined) {
        violations.push(`${job}: setup-node must not use node-version-file`)
      }
      const floor = steps
        .slice(0, i)
        .find(s => s.id && (s.run ?? '').includes('mcp-server-node-floor'))
      const expected = floor ? `\${{ steps.${floor.id}.outputs.node }}` : null
      if (expected === null || w['node-version'] !== expected) {
        violations.push(
          `${job}: setup-node node-version must be the floor step output`
        )
      }
    })
  }
  if (count !== 1) {
    violations.push(`expected exactly one setup-node step, found ${count}`)
  }
  return violations
}
