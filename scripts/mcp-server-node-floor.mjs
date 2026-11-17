// Prints the Node floor of packages/mcp-server as a GitHub Actions output
// line (`node=22`), read from the package's own engines.node (#2857).
// Plain Node with no dependencies: the workflow runs it before setup-node.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The version after `>=` in an engines.node range. Throws on anything else.
 * `engineFloorMajor` in scripts/lib/ciConfigGuard.ts reads the same field as a
 * number for the policy tests; both accept only a plain `>=N` range.
 */
export function engineFloor(range) {
  const m = /^\s*>=\s*(\d+(?:\.\d+){0,2})\s*$/.exec(String(range ?? ''))
  if (!m) {
    throw new Error(
      `engines.node must be a ">=<version>" range, got: ${String(range)}`
    )
  }
  return m[1]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkgPath = new URL(
    '../packages/mcp-server/package.json',
    import.meta.url
  )
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  console.log(`node=${engineFloor(pkg.engines?.node)}`)
}
