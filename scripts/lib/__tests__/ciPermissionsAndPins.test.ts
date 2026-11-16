/**
 * Workflow contract: ci.yml token scopes and action pins (#2861).
 *
 * - The workflow level grants only `contents: read`; every job declares its
 *   own block, classified in EXPECTED so a new job forces a decision (fail
 *   closed). Nothing in ci.yml needs packages or pull-requests write.
 * - Security Scan holds `contents: read` + `security-events: write` only. For
 *   a public repo, github/codeql-action/upload-sarif needs just
 *   `security-events: write`; `actions: read` and `contents: read` are listed
 *   by GitHub's docs ("Uploading a SARIF file to GitHub", workflow
 *   permissions) for private repositories only.
 * - Every third-party action (anything outside actions/*, github/* and local
 *   `./` paths) is pinned to a full 40-char commit SHA. First-party actions
 *   keep the repo's major-tag convention, which Dependabot (github-actions)
 *   keeps current.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

interface Step {
  uses?: string
}
interface Job {
  permissions?: Record<string, string>
  steps?: Step[]
}

const source = fs.readFileSync(
  path.resolve(process.cwd(), '.github/workflows/ci.yml'),
  'utf-8'
)
const workflow = parse(source) as {
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const EXPECTED: Record<string, Record<string, string>> = {
  changes: { contents: 'read' },
  'quality-gates': { contents: 'read' },
  security: { contents: 'read', 'security-events': 'write' },
  test: { contents: 'read' },
  'agent-cli-smoke': {
    contents: 'read',
    actions: 'read',
    checks: 'read',
    'pull-requests': 'read',
  },
  build: { contents: 'read' },
  'docs-gate': { contents: 'read' },
  gate: {
    contents: 'read',
    actions: 'read',
    'pull-requests': 'read',
  },
}

const FIRST_PARTY = /^(actions|github)\//
const SHA_PIN = /^[^@]+@[0-9a-f]{40}$/

describe('ci.yml permissions (#2861)', () => {
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

  it('each job holds exactly its expected permissions', () => {
    for (const [name, j] of Object.entries(workflow.jobs)) {
      expect(j.permissions, name).toEqual(EXPECTED[name])
    }
  })

  it('Security Scan holds only contents: read and security-events: write', () => {
    expect(workflow.jobs.security?.permissions).toEqual({
      contents: 'read',
      'security-events': 'write',
    })
  })
})

describe('ci.yml action pins (#2861)', () => {
  const uses = Object.entries(workflow.jobs).flatMap(([name, j]) =>
    (j.steps ?? [])
      .map(s => s.uses)
      .filter((u): u is string => typeof u === 'string')
      .map(u => ({ name, u }))
  )

  it('finds the actions it is meant to police', () => {
    expect(uses.some(x => x.u.startsWith('aquasecurity/trivy-action@'))).toBe(
      true
    )
  })

  it('pins every third-party action to a full commit SHA', () => {
    for (const { name, u } of uses) {
      if (u.startsWith('./') || FIRST_PARTY.test(u)) continue
      expect(u, `${name}: ${u} is not SHA-pinned`).toMatch(SHA_PIN)
    }
  })

  it('records the version of each SHA pin in a comment', () => {
    const pinned = source
      .split('\n')
      .filter(l => /uses:\s+[^@\s]+@[0-9a-f]{40}/.test(l))
    expect(pinned.length).toBeGreaterThan(0)
    for (const l of pinned) expect(l, l).toMatch(/#\s*v\d+\.\d+\.\d+/)
  })

  it('Dependabot keeps github-actions current', () => {
    const dependabot = fs.readFileSync(
      path.resolve(process.cwd(), '.github/dependabot.yml'),
      'utf-8'
    )
    const cfg = parse(dependabot) as {
      updates: { 'package-ecosystem': string; directory: string }[]
    }
    expect(
      cfg.updates.some(
        u => u['package-ecosystem'] === 'github-actions' && u.directory === '/'
      )
    ).toBe(true)
  })
})
