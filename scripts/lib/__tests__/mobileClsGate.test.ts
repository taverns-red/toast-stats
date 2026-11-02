import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { smokeJobEnv, smokeShards } from '../smokeSpecCoverage'

/**
 * Contract test for the mobile CLS gate (#1373).
 *
 * The Lighthouse gate in `lighthouserc.js` asserts `cumulative-layout-shift
 * <= 0.1` and passes — while `main` carried 0.151 at 375px. It is blind twice
 * over: `preset: 'desktop'` never samples a mobile viewport, and its fixtures
 * are served from `localhost:4173`, which Chromium does not throttle, so the
 * sequencing that produces a `display=swap` reflow largely does not occur.
 *
 * `frontend/e2e/landing-font-swap-cls.smoke.ts` closes both holes by measuring
 * on the deployed preview channel at 375px under CDP Fast-3G. Lesson 082: a
 * gate that exists but is never invoked protects nothing — so this asserts the
 * *wiring*, not just the file. Deleting the workflow step, or narrowing the
 * run to a `--project` that skips it, goes red here.
 *
 * Resolve the repo root from this file, not `process.cwd()` (Lesson 082).
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8')

const E2E_SPEC = 'frontend/e2e/landing-font-swap-cls.smoke.ts'
const PR_PREVIEW = '.github/workflows/pr-preview.yml'

describe('mobile CLS gate (#1373)', () => {
  it('the 375px CLS spec exists', () => {
    expect(existsSync(join(repoRoot, E2E_SPEC))).toBe(true)
  })

  describe('the spec measures the thing it claims to', () => {
    const spec = read(E2E_SPEC)

    it('runs at a 375px viewport', () => {
      expect(spec).toMatch(/width:\s*375/)
    })

    it('throttles the network — an unthrottled load hides the swap', () => {
      expect(spec).toMatch(/Network\.emulateNetworkConditions/)
      expect(spec).toMatch(/Network\.setCacheDisabled/)
    })

    it('installs the layout-shift observer before navigation', () => {
      // addInitScript must precede goto; an observer attached afterwards
      // misses the entries that matter.
      const initAt = spec.indexOf('addInitScript')
      const gotoAt = spec.indexOf('page.goto')
      expect(initAt).toBeGreaterThan(-1)
      expect(gotoAt).toBeGreaterThan(initAt)
      expect(spec).toMatch(/type:\s*'layout-shift'/)
    })

    it('asserts against the same 0.1 budget lighthouserc.js uses', () => {
      expect(spec).toMatch(/CLS_BUDGET\s*=\s*0\.1\b/)
      expect(spec).toMatch(/toBeLessThan\(CLS_BUDGET\)/)
    })

    it('proves the page actually painted before reading the number', () => {
      // An all-zeros CLS is usually a page that never left its loading state
      // (or a 404'd channel), not a perfect page.
      expect(spec).toMatch(/District rankings/)
    })
  })

  describe('the gate is invoked on every frontend PR', () => {
    // Since #2453 the smokes run as matrix shards of pr-preview.yml's
    // `smoke` job; smokeSpecCoverage.test.ts proves every spec runs in both
    // projects exactly once.
    const wf = read(PR_PREVIEW)
    const shards = smokeShards(wf).filter(s =>
      s.specs.split(/\s+/).includes('e2e/landing-font-swap-cls.smoke.ts')
    )

    it('pr-preview.yml runs the spec against the deployed channel', () => {
      // Local numbers are not comparable: loopback is not throttled.
      expect(shards.length).toBeGreaterThan(0)
      expect(smokeJobEnv(wf)['BASE_URL']).toBe(
        '${{ needs.preview.outputs.url }}'
      )
    })

    it('does not filter the run to the webkit-only project', () => {
      expect(shards.some(s => s.project !== 'webkit')).toBe(true)
    })

    it('measures one Chromium test at a time, as before sharding (#2453)', () => {
      const chromium = shards.filter(s => s.project === 'smoke')
      expect(chromium.length).toBeGreaterThan(0)
      for (const s of chromium) expect(s.workers).toBe('1')
    })
  })

  it('lighthouserc.js documents that it cannot see this failure', () => {
    // The desktop-only blind spot is not obvious from the config. Without a
    // pointer, the next person to read a green Lighthouse run concludes the
    // mobile budget is covered.
    const rc = read('lighthouserc.js')
    expect(rc).toMatch(/landing-font-swap-cls\.smoke\.ts/)
    expect(rc).toMatch(/#1373/)
  })
})
