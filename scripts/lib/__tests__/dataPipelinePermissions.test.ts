/**
 * Workflow contract: per-job permissions in data-pipeline.yml (#2868).
 *
 * The workflow level grants only `contents: read`; each job declares its own
 * minimal block. `id-token: write` (the ability to mint a Workload Identity
 * token) is held only by jobs that run a google-github-actions/auth step, so
 * a job that runs no auth step cannot mint the pipeline identity from code it
 * executes. Every job is classified in EXPECTED, so adding a job forces
 * someone to decide what it may hold (fail closed). Mirrors #2861 for ci.yml.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

interface Step {
  uses?: string
  run?: string
  env?: Record<string, string>
}
interface Job {
  permissions?: Record<string, string>
  steps?: Step[]
}

const source = fs.readFileSync(
  path.resolve(process.cwd(), '.github/workflows/data-pipeline.yml'),
  'utf-8'
)
const workflow = parse(source) as {
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const AUTH = 'google-github-actions/auth'
const hasAuth = (j: Job): boolean =>
  (j.steps ?? []).some(s => (s.uses ?? '').startsWith(AUTH))

// Explicit expected map: job -> exact permissions block.
const EXPECTED: Record<string, Record<string, string>> = {
  pipeline: { contents: 'read', 'id-token': 'write', issues: 'write' },
  'closing-registry-pr': {
    contents: 'write',
    'pull-requests': 'write',
    'id-token': 'write',
    issues: 'write',
  },
  'daily-reports': { contents: 'read', 'id-token': 'write' },
  'place-reports': { contents: 'read', 'id-token': 'write' },
  'education-rollup': { contents: 'read', 'id-token': 'write' },
  'promote-reports': {
    contents: 'read',
    'id-token': 'write',
    issues: 'write',
  },
  'data-smoke': { contents: 'read' },
  'status-heartbeat': { contents: 'read' },
  'data-auto-restore-decide': {
    contents: 'read',
    'id-token': 'write',
    issues: 'write',
  },
  'data-auto-restore-execute': {
    contents: 'read',
    'id-token': 'write',
    issues: 'write',
  },
  'og-cards': { contents: 'read', 'id-token': 'write' },
  'education-ledger-history': { contents: 'read', 'id-token': 'write' },
}

describe('data-pipeline.yml permissions (#2868)', () => {
  it('workflow level grants exactly contents: read', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
  })

  it('every job is classified in the expected map, and vice versa', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual(
      Object.keys(EXPECTED).sort()
    )
  })

  it('every job declares its own permissions block', () => {
    for (const [name, j] of Object.entries(workflow.jobs)) {
      expect(j.permissions, `${name} has no permissions:`).toBeDefined()
    }
  })

  it('every job with an auth step holds id-token: write', () => {
    for (const [name, j] of Object.entries(workflow.jobs)) {
      if (hasAuth(j)) {
        expect(j.permissions?.['id-token'], name).toBe('write')
      }
    }
  })

  it('no job without an auth step holds id-token: write', () => {
    for (const [name, j] of Object.entries(workflow.jobs)) {
      if (!hasAuth(j)) {
        expect(j.permissions?.['id-token'], name).toBeUndefined()
      }
    }
  })

  it('each job holds exactly its expected permissions', () => {
    for (const [name, j] of Object.entries(workflow.jobs)) {
      expect(j.permissions, name).toEqual(EXPECTED[name])
    }
  })

  it('write scopes are backed by the steps that use them', () => {
    for (const [name, j] of Object.entries(workflow.jobs)) {
      const body = JSON.stringify(j.steps ?? [])
      const w = j.permissions ?? {}
      if (w.issues === 'write') expect(body, name).toMatch(/gh issue /)
      if (w['pull-requests'] === 'write')
        expect(body, name).toMatch(/gh pr create/)
      if (w.contents === 'write') expect(body, name).toMatch(/git push/)
    }
  })
})
