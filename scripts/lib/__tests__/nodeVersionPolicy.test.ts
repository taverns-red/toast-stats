/**
 * Config guard: CI and dev tooling run on Node 26 LTS (#2853, ops#347).
 *
 * - `.nvmrc` is the single source of the Node version and is 26.x.
 * - Every `private: true` package declares `engines.node` with a floor >= 26.
 * - `packages/mcp-server` is published to npm, so its floor is what consumers
 *   need; it stays at its published floor (22), not the tooling's.
 * - No workflow hard-codes a Node major: `setup-node` reads `.nvmrc`.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

// Resolve from this file, not process.cwd() (Lesson 082).
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows')
const TOOLING_MAJOR = 26
const MCP_SERVER_FLOOR = 22

interface Pkg {
  name: string
  private?: boolean
  engines?: { node?: string }
}

function readPkg(rel: string): Pkg {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Pkg
}

function floorOf(range: string | undefined): number {
  const m = /^>=\s*(\d+)/.exec(range ?? '')
  if (!m) throw new Error(`unparseable engines.node: ${String(range)}`)
  return Number(m[1])
}

const packageFiles = [
  'package.json',
  ...(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
      .workspaces as string[]
  ).map(ws => `${ws}/package.json`),
]

describe('Node version policy (#2853)', () => {
  it('.nvmrc pins Node 26.x', () => {
    const v = fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim()
    expect(v).toMatch(new RegExp(`^v?${TOOLING_MAJOR}\\.\\d+\\.\\d+$`))
  })

  for (const file of packageFiles) {
    const pkg = readPkg(file)
    if (pkg.private === true) {
      it(`${file} (private) requires Node >= ${TOOLING_MAJOR}`, () => {
        expect(floorOf(pkg.engines?.node)).toBeGreaterThanOrEqual(TOOLING_MAJOR)
      })
    }
  }

  it(`mcp-server keeps its published floor (>=${MCP_SERVER_FLOOR})`, () => {
    const pkg = readPkg('packages/mcp-server/package.json')
    expect(pkg.private).not.toBe(true)
    expect(floorOf(pkg.engines?.node)).toBe(MCP_SERVER_FLOOR)
  })

  it('every setup-node step reads .nvmrc, none hard-codes a version', () => {
    const offenders: string[] = []
    let sites = 0
    for (const f of fs.readdirSync(WORKFLOW_DIR)) {
      if (!/\.ya?ml$/.test(f)) continue
      // The one deliberate exception: it tests mcp-server on its own
      // published floor (#2857), asserted in mcpServerNodeFloorWorkflow.test.
      if (f === 'mcp-server-node-floor.yml') continue
      const doc = parse(
        fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8')
      ) as {
        jobs?: Record<string, { steps?: Array<Record<string, unknown>> }>
      }
      for (const [job, def] of Object.entries(doc.jobs ?? {})) {
        for (const step of def.steps ?? []) {
          if (!String(step.uses ?? '').startsWith('actions/setup-node')) {
            continue
          }
          sites++
          const w = (step.with ?? {}) as Record<string, unknown>
          if (w['node-version'] !== undefined) {
            offenders.push(`${f}:${job} hard-codes node-version`)
          }
          if (w['node-version-file'] !== '.nvmrc') {
            offenders.push(`${f}:${job} does not read .nvmrc`)
          }
        }
      }
    }
    expect(sites).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
