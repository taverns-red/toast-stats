/**
 * Contract: every `frontend/e2e/*.smoke.ts` runs in the PR-preview job (#2141).
 *
 * Six specs (district-growth, district-education, district-survival,
 * clubs-coach-column, kpi-tier-labels, staging) had no step in
 * `pr-preview.yml`, so they ran only locally. A spec either has a named step
 * or is picked up by the catch-all step, which runs what
 * `scripts/unlisted-smoke-specs.ts` prints. Lesson 082: a gate that is never
 * invoked protects nothing, so this checks the wiring, not just the files.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'
import {
  CATCH_ALL_STEP,
  namedSmokeSpecs,
  toSpecPaths,
  unlistedSmokeSpecs,
} from '../smokeSpecCoverage'

const ROOT = process.cwd()
const PR_PREVIEW = path.join(ROOT, '.github/workflows/pr-preview.yml')
const E2E = path.join(ROOT, 'frontend/e2e')

interface Step {
  name?: string
  if?: string
  run?: string
  env?: Record<string, string>
  'working-directory'?: string
}

const wfText = fs.readFileSync(PR_PREVIEW, 'utf-8')
const steps: Step[] =
  (parse(wfText) as { jobs: { preview: { steps: Step[] } } }).jobs.preview
    .steps ?? []
const specs = toSpecPaths(
  fs.readdirSync(E2E, { recursive: true, encoding: 'utf-8' })
)

describe('smoke spec selection (pure)', () => {
  const wf = `
jobs:
  a:
    steps:
      - name: one
        # e2e/commented.smoke.ts is only a comment
        run: npx playwright test --config playwright.config.ts e2e/one.smoke.ts
      - name: folded
        run: >-
          npx playwright test --config playwright.config.ts
          e2e/two.smoke.ts
      - name: not playwright
        run: echo e2e/echoed.smoke.ts
      - name: ${CATCH_ALL_STEP}
        run: npx playwright test e2e/catch.smoke.ts
`
  it('reads specs from playwright steps only, ignoring the catch-all', () => {
    expect(namedSmokeSpecs(wf)).toEqual([
      'e2e/one.smoke.ts',
      'e2e/two.smoke.ts',
    ])
  })

  it('returns the specs no named step runs, sorted and de-duplicated', () => {
    expect(
      unlistedSmokeSpecs(
        [
          'e2e/z.smoke.ts',
          'e2e/one.smoke.ts',
          'e2e/a.smoke.ts',
          'e2e/a.smoke.ts',
        ],
        ['e2e/one.smoke.ts']
      )
    ).toEqual(['e2e/a.smoke.ts', 'e2e/z.smoke.ts'])
  })

  it('maps e2e-relative files to spec paths, smoke specs only', () => {
    expect(
      toSpecPaths(['b.smoke.ts', 'helpers/x.ts', 'sub\\c.smoke.ts', 'a.json'])
    ).toEqual(['e2e/b.smoke.ts', 'e2e/sub/c.smoke.ts'])
  })
})

describe('every smoke spec runs in pr-preview.yml (#2141)', () => {
  const catchAll = steps.find(s => s.name === CATCH_ALL_STEP)
  const named = namedSmokeSpecs(wfText)

  it('finds the smoke specs', () => {
    expect(specs.length).toBeGreaterThan(30)
  })

  it('has a catch-all step', () => {
    expect(
      catchAll,
      `pr-preview.yml needs a "${CATCH_ALL_STEP}" step`
    ).toBeDefined()
  })

  it('runs every spec: by a named step or by the catch-all', () => {
    const covered = new Set([
      ...named,
      ...(catchAll ? unlistedSmokeSpecs(specs, named) : []),
    ])
    expect(specs.filter(s => !covered.has(s))).toEqual([])
  })

  it('names no spec that does not exist', () => {
    expect(named.filter(s => !specs.includes(s))).toEqual([])
  })

  it('has spec file names the catch-all can word-split', () => {
    for (const s of specs) expect(s).toMatch(/^[\w./-]+$/)
  })

  describe('the catch-all step', () => {
    const run = catchAll?.run ?? ''

    it('runs the selector, then playwright on what it prints', () => {
      expect(run).toContain('scripts/unlisted-smoke-specs.ts')
      expect(run).toMatch(
        /playwright test --config playwright\.config\.ts "?\$specs/
      )
    })

    it('exits before playwright when nothing is left', () => {
      // A bare `playwright test` runs EVERY spec a second time.
      const guard = run.indexOf('-z "$specs"')
      expect(guard).toBeGreaterThan(-1)
      expect(run.indexOf('exit 0', guard)).toBeGreaterThan(guard)
      expect(run.indexOf('playwright test')).toBeGreaterThan(guard)
    })

    it('runs both engines against the deployed preview, only when heavy', () => {
      expect(run).not.toMatch(/--project/)
      expect(catchAll?.['working-directory']).toBe('frontend')
      expect(catchAll?.env?.['BASE_URL']).toBe(
        '${{ steps.deploy.outputs.url }}'
      )
      expect(catchAll?.if).toBe("env.HEAVY_SMOKE == 'true'")
    })

    it('comes after the browsers are installed', () => {
      const install = steps.findIndex(s =>
        /playwright install/.test(s.run ?? '')
      )
      expect(install).toBeGreaterThan(-1)
      expect(steps.indexOf(catchAll as Step)).toBeGreaterThan(install)
    })
  })
})
