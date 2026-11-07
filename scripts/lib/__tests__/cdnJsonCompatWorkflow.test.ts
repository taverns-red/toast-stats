/**
 * Workflow contract: the CDN JSON compat guard (#2494, ADR 0019 steps 1
 * and 3). Sourced from the YAML so the guard cannot drift.
 *
 * - It runs on every PR to main, with no path filter, so it can be made a
 *   required check without sitting "Expected" on a PR it skipped.
 * - It re-runs on `labeled` / `unlabeled`, so adding or removing
 *   `db-breaking-approved` re-decides the check.
 * - It checks out full history with tags, or `git describe` finds no
 *   release and the guard fails.
 * - It builds the PR's shared-contracts before the runner imports it, and
 *   hands the runner the token and PR number the override check needs.
 * - Its token can read issue events and nothing more.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const FILE = path.resolve(
  process.cwd(),
  '.github/workflows/cdn-json-compat.yml'
)

interface Step {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
  env?: Record<string, string>
}
interface Workflow {
  on: {
    pull_request?: {
      branches?: string[]
      types?: string[]
      paths?: string[]
      'paths-ignore'?: string[]
    }
  }
  permissions?: Record<string, string>
  jobs: Record<string, { name?: string; steps: Step[] }>
}

const wf = (): Workflow => parse(fs.readFileSync(FILE, 'utf-8')) as Workflow
const steps = () => Object.values(wf().jobs)[0]?.steps ?? []
const runIndex = (re: RegExp) => steps().findIndex(s => re.test(s.run ?? ''))

describe('cdn-json-compat.yml (#2494)', () => {
  it('runs on every PR to main, unfiltered, and on label changes', () => {
    const pr = wf().on.pull_request
    expect(pr?.branches).toEqual(['main'])
    expect(pr?.types).toEqual(
      expect.arrayContaining([
        'opened',
        'synchronize',
        'reopened',
        'labeled',
        'unlabeled',
      ])
    )
    expect(pr?.paths).toBeUndefined()
    expect(pr?.['paths-ignore']).toBeUndefined()
  })

  it('has one job named for the check', () => {
    const jobs = Object.values(wf().jobs)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.name).toBe('CDN JSON Compat')
  })

  it('reads only what it needs', () => {
    expect(wf().permissions).toEqual({
      contents: 'read',
      issues: 'read',
      'pull-requests': 'read',
    })
  })

  it('checks out full history with tags', () => {
    const checkout = steps().find(s => s.uses?.startsWith('actions/checkout'))
    expect(checkout?.with?.['fetch-depth']).toBe(0)
    expect(checkout?.with?.['fetch-tags']).toBe(true)
  })

  it('builds the PR shared-contracts, then runs the guard with tsx', () => {
    const build = runIndex(/npm run build:shared-contracts/)
    const guard = runIndex(/npx tsx scripts\/check-cdn-json-compat\.ts/)
    expect(build).toBeGreaterThanOrEqual(0)
    expect(guard).toBeGreaterThan(build)
  })

  it('passes the token and PR number for the override check', () => {
    const guard = steps()[runIndex(/check-cdn-json-compat/)]
    expect(guard?.env?.['GITHUB_TOKEN']).toBe('${{ github.token }}')
    expect(guard?.env?.['PR_NUMBER']).toBe(
      '${{ github.event.pull_request.number }}'
    )
  })

  it('never softens a failure', () => {
    const text = fs.readFileSync(FILE, 'utf-8')
    expect(text).not.toMatch(/continue-on-error/)
    expect(text).not.toMatch(/\|\|\s*true/)
  })
})
