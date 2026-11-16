/**
 * Workflow contract: credential-handling actions are SHA-pinned in every
 * workflow (#2877, follow-up to #2861).
 *
 * `google-github-actions/*` (auth, setup-gcloud) receive the OIDC token and
 * mint GCP credentials, so a force-pushed tag would hand an attacker the
 * deploy identity (cf. the March 2026 trivy-action tag hijack). Every use, at
 * step or job level, in any workflow must be pinned to a 40-char commit SHA
 * with a `# vX.Y.Z` comment, and one action version must resolve to one SHA
 * across all workflows.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

interface Step {
  uses?: string
}
interface Job {
  uses?: string
  steps?: Step[]
}

const dir = path.resolve(process.cwd(), '.github/workflows')
const files = fs
  .readdirSync(dir)
  .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort()

const CREDENTIAL_ACTION = /^google-github-actions\//
const SHA_PIN = /^[^@]+@[0-9a-f]{40}$/

interface Use {
  file: string
  uses: string
}

const uses: Use[] = files.flatMap(file => {
  const wf = parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as {
    jobs?: Record<string, Job>
  }
  return Object.values(wf.jobs ?? {}).flatMap(job => [
    ...(typeof job.uses === 'string' ? [{ file, uses: job.uses }] : []),
    ...(job.steps ?? [])
      .map(s => s.uses)
      .filter((u): u is string => typeof u === 'string')
      .map(u => ({ file, uses: u })),
  ])
})

const credentialUses = uses.filter(x => CREDENTIAL_ACTION.test(x.uses))

describe('credential action pins (#2877)', () => {
  it('finds the auth and setup-gcloud uses it is meant to police', () => {
    const names = new Set(credentialUses.map(x => x.uses.split('@')[0]))
    expect(names.has('google-github-actions/auth')).toBe(true)
    expect(names.has('google-github-actions/setup-gcloud')).toBe(true)
  })

  it('pins every google-github-actions use to a full commit SHA', () => {
    for (const { file, uses: u } of credentialUses) {
      expect(u, `${file}: ${u} is not SHA-pinned`).toMatch(SHA_PIN)
    }
  })

  it('records the version of each pin in a # vX.Y.Z comment', () => {
    const lines = files.flatMap(file =>
      fs
        .readFileSync(path.join(dir, file), 'utf-8')
        .split('\n')
        .filter(l => /uses:\s*google-github-actions\//.test(l))
        .map(l => ({ file, l }))
    )
    expect(lines.length).toBeGreaterThan(0)
    for (const { file, l } of lines) {
      expect(l, `${file}: ${l}`).toMatch(
        /uses:\s*google-github-actions\/[^@\s]+@[0-9a-f]{40}\s+#\s*v\d+\.\d+\.\d+\s*$/
      )
    }
  })

  it('uses one SHA per action and version across all workflows', () => {
    const seen = new Map<string, Set<string>>()
    for (const file of files) {
      for (const l of fs
        .readFileSync(path.join(dir, file), 'utf-8')
        .split('\n')) {
        const m = l.match(
          /uses:\s*(google-github-actions\/[^@\s]+)@([0-9a-f]{40})\s+#\s*(v\d+\.\d+\.\d+)/
        )
        if (!m) continue
        const key = `${m[1]} ${m[3]}`
        seen.set(key, (seen.get(key) ?? new Set()).add(m[2]!))
      }
    }
    for (const [key, shas] of seen) {
      expect([...shas], `${key} resolves to more than one SHA`).toHaveLength(1)
    }
  })
})
