import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Contract test for the district subpages CLS gate (#1837).
 *
 * `lighthouserc.js` only loads `/` and `district-overview-cls.smoke.ts` only
 * the Overview hub, so divisions/analytics/action-list shipped at CLS
 * 0.20–0.30 with every gate green. `frontend/e2e/district-subpages-cls.smoke.ts`
 * measures every routed subpage on the deployed preview. Lesson 082: a gate
 * that exists but is never invoked protects nothing — so this asserts the
 * wiring as well as the file (same shape as `districtOverviewClsGate.test.ts`).
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8')

const E2E_SPEC = 'frontend/e2e/district-subpages-cls.smoke.ts'
const PR_PREVIEW = '.github/workflows/pr-preview.yml'
const APP = 'frontend/src/App.tsx'

describe('district subpages CLS gate (#1837)', () => {
  it('the spec exists', () => {
    expect(existsSync(join(repoRoot, E2E_SPEC))).toBe(true)
  })

  describe('the spec measures the thing it claims to', () => {
    const spec = existsSync(join(repoRoot, E2E_SPEC)) ? read(E2E_SPEC) : ''

    it('covers every routed /district/:id/<subpage> in App.tsx', () => {
      // Single-segment subpages only: the club/division/area detail routes
      // are entity pages, not district subpages.
      const subpages = [
        ...read(APP).matchAll(/path: 'district\/:districtId\/([a-z-]+)'/g),
      ].map(m => m[1])
      expect(subpages.length).toBeGreaterThanOrEqual(8)
      for (const sub of subpages) {
        expect(spec, `missing subpage '${sub}'`).toContain(`'${sub}'`)
      }
    })

    it('samples a phone and a desktop width', () => {
      expect(spec).toMatch(/width:\s*375/)
      expect(spec).toMatch(/width:\s*1280/)
    })

    it('loads cold and throttled, with the observer installed before navigation', () => {
      expect(spec).toMatch(/Network\.setCacheDisabled/)
      expect(spec).toMatch(/Network\.emulateNetworkConditions/)
      expect(spec).toMatch(/Emulation\.setCPUThrottlingRate/)
      const initAt = spec.indexOf('addInitScript')
      const gotoAt = spec.indexOf('page.goto')
      expect(initAt).toBeGreaterThan(-1)
      expect(gotoAt).toBeGreaterThan(initAt)
      expect(spec).toMatch(/type:\s*'layout-shift'/)
    })

    it('waits for the data reads, not just `load`', () => {
      expect(spec).toMatch(/waitUntil:\s*'networkidle'/)
    })

    it('asserts against the same 0.1 budget lighthouserc.js uses', () => {
      expect(spec).toMatch(/CLS_BUDGET\s*=\s*0\.1\b/)
      expect(spec).toMatch(/toBeLessThan\(CLS_BUDGET\)/)
    })
  })

  describe('the gate is invoked on every frontend PR', () => {
    const wf = read(PR_PREVIEW)
    const step = wf
      .split(/\n\s*- name: /)
      .find(s => s.includes('e2e/district-subpages-cls.smoke.ts'))

    it('pr-preview.yml runs the spec against the deployed channel', () => {
      expect(step).toBeDefined()
      expect(step).toContain('BASE_URL: ${{ steps.deploy.outputs.url }}')
    })

    it('does not filter the run to the webkit-only project', () => {
      expect(step).not.toMatch(/--project[= ]webkit/)
    })
  })
})
