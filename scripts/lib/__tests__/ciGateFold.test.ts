/**
 * Workflow shape: CI Gate is a final job in ci.yml that `needs:` the real
 * jobs, so nothing polls (#2607 item 3). Required check name, absence
 * semantics and the PR-title check must survive the fold.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const root = process.cwd()
const read = (f: string) =>
  readFileSync(join(root, '.github/workflows', f), 'utf8')

interface Job {
  name?: string
  needs?: string | string[]
  if?: string
  steps?: { run?: string; env?: Record<string, string> }[]
  permissions?: Record<string, string>
  'timeout-minutes'?: number
}
const jobs = (f: string) =>
  (parse(read(f)) as { jobs: Record<string, Job> }).jobs
const asList = (n: Job['needs']) => (Array.isArray(n) ? n : n ? [n] : [])

describe('ci.yml carries the CI Gate as a final needs: job (#2607)', () => {
  const ci = () => jobs('ci.yml')
  const gate = () => Object.values(ci()).find(j => j.name === 'CI Gate')

  it('has exactly one job named CI Gate', () => {
    expect(Object.values(ci()).filter(j => j.name === 'CI Gate')).toHaveLength(
      1
    )
  })
  it('needs every job the old gate expected, plus changes and Docs Gate', () => {
    const byName = Object.entries(ci())
    const idOf = (name: string) => byName.find(([, j]) => j.name === name)![0]
    const needs = asList(gate()!.needs)
    for (const n of [
      'Quality Gates',
      'Test Suite',
      'Build Applications',
      'Docs Gate',
    ])
      expect(needs).toContain(idOf(n))
    expect(needs).toContain('changes')
  })
  it('runs with always() so a failed or skipped need still reaches the gate', () => {
    expect(gate()!.if).toContain('always()')
  })
  it('does not poll: no check-runs polling script remains', () => {
    expect(existsSync(join(root, 'scripts/ci-gate.ts'))).toBe(false)
    expect(existsSync(join(root, '.github/workflows/ci-gate.yml'))).toBe(false)
  })
  it('pull_request has no path filter, so the gate exists on every PR head', () => {
    const on = (
      parse(read('ci.yml')) as { on: Record<string, Record<string, unknown>> }
    ).on
    expect(on.pull_request!['paths-ignore']).toBeUndefined()
    expect(on.pull_request!.paths).toBeUndefined()
  })
  it('keeps the release-notes-safe title check, via env', () => {
    const steps = gate()!.steps ?? []
    expect(JSON.stringify(steps)).toContain('check-pr-title.ts')
    expect(JSON.stringify(steps)).toContain('github.event.pull_request.title')
  })
  it('docs.yml no longer runs on pull_request (Docs Gate lives in ci.yml)', () => {
    const on = (parse(read('docs.yml')) as { on: Record<string, unknown> }).on
    expect(on.pull_request).toBeUndefined()
  })

  // #2881: the no-op path waits for the earlier real run (13 to 21 minutes of
  // CI wall time), so the job timeout is a deliberate wait, not a test mask.
  it('the gate timeout covers the no-op wait (#2881)', () => {
    expect(gate()!['timeout-minutes']).toBe(45)
  })

  // COO-approved scoped exception (#2607): on a no-op edit the gate reads the
  // head's check runs once, so ONLY the gate job gets these read scopes. The
  // workflow-level block is narrowed separately (#2861).
  it('the gate job holds exactly four read scopes', () => {
    expect(gate()!.permissions).toEqual({
      contents: 'read',
      checks: 'read',
      actions: 'read',
      'pull-requests': 'read',
    })
  })
  // These jobs used to inherit the workflow-level write token (docs-gate ran
  // under `contents: read` in docs.yml). Narrowing only.
  it.each(['changes', 'docs-gate'])('%s runs with contents: read only', id => {
    expect(ci()[id]!.permissions).toEqual({ contents: 'read' })
  })
  it('no job other than the gate and Agent CLI smoke has checks/actions scopes', () => {
    const holders = Object.entries(ci())
      .filter(
        ([, j]) =>
          j.permissions &&
          ('checks' in j.permissions || 'actions' in j.permissions)
      )
      .map(([id]) => id)
      .sort()
    expect(holders).toEqual(['agent-cli-smoke', 'gate'])
  })
})
