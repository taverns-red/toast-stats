import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { smokeJobEnv, smokeShards } from '../smokeSpecCoverage'

/**
 * Contract test for the district overview CLS gate (#1647).
 *
 * `lighthouserc.js` only loads `/`, so `/district/:id` carried CLS 2.5–7× its
 * budget with every gate green. `frontend/e2e/district-overview-cls.smoke.ts`
 * measures it on the deployed preview. Lesson 082: a gate that exists but is
 * never invoked protects nothing — so this asserts the wiring as well as the
 * file (same shape as `mobileClsGate.test.ts`).
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8')

const E2E_SPEC = 'frontend/e2e/district-overview-cls.smoke.ts'
const PR_PREVIEW = '.github/workflows/pr-preview.yml'

describe('district overview CLS gate (#1647)', () => {
  it('the spec exists', () => {
    expect(existsSync(join(repoRoot, E2E_SPEC))).toBe(true)
  })

  describe('the spec measures the thing it claims to', () => {
    const spec = existsSync(join(repoRoot, E2E_SPEC)) ? read(E2E_SPEC) : ''

    it('loads the district overview for the current and a past program year', () => {
      expect(spec).toMatch(/'\/district\/61'/)
      expect(spec).toMatch(/'\/district\/61\?py=2024'/)
    })

    it('samples a phone and a desktop width', () => {
      expect(spec).toMatch(/width:\s*412/)
      expect(spec).toMatch(/width:\s*1350/)
    })

    it('loads cold, with the observer installed before navigation', () => {
      expect(spec).toMatch(/Network\.setCacheDisabled/)
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

    it('waits for the loaded KPI strip before reading the number', () => {
      expect(spec).toMatch(/district-kpi-strip--loading/)
    })
  })

  describe('the gate is invoked on every frontend PR', () => {
    // Since #2453 the smokes run as matrix shards of pr-preview.yml's
    // `smoke` job; smokeSpecCoverage.test.ts proves every spec runs in both
    // projects exactly once.
    const wf = read(PR_PREVIEW)
    const shards = smokeShards(wf).filter(s =>
      s.specs.split(/\s+/).includes('e2e/district-overview-cls.smoke.ts')
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
})
