/**
 * Workflow contract: mcp-server is built and tested on its published Node
 * floor (#2857, follow-up to #2853).
 *
 * `@taverns-red/toast-stats-mcp` ships with `engines.node >=22`, but every
 * other job runs on `.nvmrc` (Node 26). This workflow runs the package on the
 * floor itself so a newer-Node-only API can't reach Node 22 users unnoticed.
 *
 * - The floor is read from the package's own `engines.node`, never typed in
 *   the workflow.
 * - It runs on mcp-server (and the shared-contracts it imports) path changes
 *   plus a weekly schedule, only.
 * - `contents: read` only, no secrets, no GCP auth, GitHub-hosted runner.
 * - It is not a required check: ci.yml's CI Gate does not depend on it.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
// @ts-expect-error plain .mjs helper shared with the workflow, no types
import { engineFloor } from '../../mcp-server-node-floor.mjs'
import { findSetupNodeViolations } from '../mcpServerNodeFloorGuard'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const FILE = '.github/workflows/mcp-server-node-floor.yml'

interface Step {
  id?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
}
interface Workflow {
  on: {
    pull_request?: { paths?: string[]; branches?: string[] }
    schedule?: Array<{ cron: string }>
    [event: string]: unknown
  }
  permissions?: Record<string, string>
  jobs: Record<
    string,
    {
      permissions?: Record<string, string>
      'runs-on'?: string
      needs?: unknown
      steps?: Step[]
    }
  >
}

const source = fs.readFileSync(path.join(ROOT, FILE), 'utf8')
const wf = parse(source) as Workflow
const steps = Object.values(wf.jobs).flatMap(j => j.steps ?? [])

describe('findSetupNodeViolations', () => {
  const floorStep = {
    id: 'floor',
    run: 'node scripts/mcp-server-node-floor.mjs >> "$GITHUB_OUTPUT"',
  }
  const good = {
    uses: 'actions/setup-node@v7',
    with: { 'node-version': '${{ steps.floor.outputs.node }}' },
  }
  const docWith = (jobs: Record<string, Step[]>): Workflow =>
    ({
      jobs: Object.fromEntries(
        Object.entries(jobs).map(([k, s]) => [k, { steps: s }])
      ),
    }) as unknown as Workflow

  it('accepts one setup-node fed by the floor step', () => {
    expect(findSetupNodeViolations(docWith({ a: [floorStep, good] }))).toEqual(
      []
    )
  })

  it('rejects a second setup-node on a literal version in another job', () => {
    const bad = {
      uses: 'actions/setup-node@v7',
      with: { 'node-version': '20' },
    }
    const violations = findSetupNodeViolations(
      docWith({ a: [floorStep, good], b: [bad] })
    )
    expect(violations.length).toBeGreaterThan(0)
  })

  it('rejects a second setup-node in the same job', () => {
    const second = {
      uses: 'actions/setup-node@v7',
      with: { 'node-version-file': '.nvmrc' },
    }
    expect(
      findSetupNodeViolations(docWith({ a: [floorStep, good, second] })).length
    ).toBeGreaterThan(0)
  })

  it('rejects a setup-node whose version does not come from the floor step', () => {
    const other = {
      uses: 'actions/setup-node@v7',
      with: { 'node-version': '${{ steps.other.outputs.node }}' },
    }
    expect(
      findSetupNodeViolations(docWith({ a: [floorStep, other] })).length
    ).toBeGreaterThan(0)
  })

  it('rejects a workflow with no setup-node', () => {
    expect(
      findSetupNodeViolations(docWith({ a: [floorStep] })).length
    ).toBeGreaterThan(0)
  })
})

describe('engineFloor', () => {
  it('reads the lower bound of a >= range', () => {
    expect(engineFloor('>=22')).toBe('22')
    expect(engineFloor('>=22.4.0')).toBe('22.4.0')
    expect(engineFloor(' >= 24 ')).toBe('24')
  })

  it('refuses a range with no floor instead of guessing', () => {
    expect(() => engineFloor('22')).toThrow(/engines\.node/)
    expect(() => engineFloor('^22')).toThrow(/engines\.node/)
    expect(() => engineFloor(undefined)).toThrow(/engines\.node/)
  })
})

describe('mcp-server Node floor workflow (#2857)', () => {
  it('runs only on mcp-server path changes and a weekly schedule', () => {
    expect(Object.keys(wf.on).sort()).toEqual(['pull_request', 'schedule'])
    expect(wf.on.pull_request?.paths).toEqual(
      expect.arrayContaining([
        'packages/mcp-server/**',
        'packages/shared-contracts/**',
        FILE,
      ])
    )
    const [only, ...rest] = wf.on.schedule ?? []
    expect(rest).toEqual([])
    // minute hour day-of-month month day-of-week: weekly = a fixed weekday.
    expect(only?.cron).toMatch(/^\d+ \d+ \* \* [0-6]$/)
  })

  it('grants contents: read and nothing else, at workflow and job level', () => {
    expect(wf.permissions).toEqual({ contents: 'read' })
    for (const [name, j] of Object.entries(wf.jobs)) {
      expect(j.permissions, name).toEqual({ contents: 'read' })
    }
  })

  it('uses a GitHub-hosted runner, no secrets and no cloud auth', () => {
    for (const [name, j] of Object.entries(wf.jobs)) {
      expect(String(j['runs-on']), name).toMatch(/^ubuntu-/)
    }
    expect(source).not.toMatch(/secrets\./)
    expect(source).not.toMatch(/google-github-actions/)
    expect(source).not.toMatch(/id-token/)
  })

  it('checks out without persisting credentials', () => {
    const checkouts = steps.filter(s => s.uses?.startsWith('actions/checkout@'))
    expect(checkouts.length).toBeGreaterThan(0)
    for (const s of checkouts) {
      expect(s.with?.['persist-credentials']).toBe(false)
    }
  })

  it('takes the Node version from engines.node, not a literal', () => {
    // Every setup-node in the file, across all jobs: exactly one, fed by the
    // floor step. A second one on a literal version must not slip through.
    expect(findSetupNodeViolations(wf)).toEqual([])
    expect(
      steps.filter(s => s.uses?.startsWith('actions/setup-node@'))
    ).toHaveLength(1)
  })

  it('builds shared-contracts and mcp-server, then tests mcp-server', () => {
    const runs = steps.map(s => s.run ?? '').join('\n')
    expect(runs).toContain('npm ci')
    expect(runs).toContain('npm run build:shared-contracts')
    expect(runs).toContain('npm run build:mcp-server')
    expect(runs).toContain(
      'npm run test --workspace=@taverns-red/toast-stats-mcp'
    )
  })

  it('is not part of the CI Gate', () => {
    const ci = parse(
      fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')
    ) as Workflow
    const needs = JSON.stringify(ci.jobs.gate?.needs ?? [])
    expect(needs).not.toContain('floor')
    expect(
      fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')
    ).not.toContain('mcp-server-node-floor')
  })
})
