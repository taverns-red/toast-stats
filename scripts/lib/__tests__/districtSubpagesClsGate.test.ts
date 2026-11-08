import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { smokeJobEnv, smokeShards } from '../smokeSpecCoverage'

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
      // are entity pages, not district subpages. A route whose element is a
      // redirect (the retired /analytics, #2159) renders no page to measure.
      const subpages = [
        ...read(APP).matchAll(
          /path: 'district\/:districtId\/([a-z-]+)',\s*element:\s*(<\w+)?/g
        ),
      ]
        .filter(m => !/Redirect$/.test(m[2] ?? ''))
        .map(m => m[1])
      expect(subpages.length).toBeGreaterThanOrEqual(8)
      for (const sub of subpages) {
        expect(spec, `missing subpage '${sub}'`).toContain(`'${sub}'`)
      }
    })

    it('covers the division and area entity pages at 0.05 (#1896)', () => {
      // Both nested entity routes from App.tsx, measured on real D61 ids.
      expect(read(APP)).toContain(
        `path: 'district/:districtId/division/:divId'`
      )
      expect(read(APP)).toContain(
        `path: 'district/:districtId/division/:divId/area/:areaId'`
      )
      expect(spec).toContain(`'/district/61/division/A'`)
      expect(spec).toContain(`'/district/61/division/A/area/01'`)
      expect(spec).toMatch(/ENTITY_CLS_BUDGET\s*=\s*0\.05\b/)
      expect(spec).toMatch(/toBeLessThan\(ENTITY_CLS_BUDGET\)/)
    })

    it('covers both phone clubs-list shapes: grouped and flat (#1833)', () => {
      expect(spec).toContain(`'clubs'`)
      expect(spec).toMatch(/'clubs\?sort=name&dir=desc'/)
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
    // Since #2453 the smokes run as matrix shards of pr-preview.yml's
    // `smoke` job; smokeSpecCoverage.test.ts proves every spec runs in both
    // projects exactly once.
    const wf = read(PR_PREVIEW)
    const shards = smokeShards(wf).filter(s =>
      s.specs.split(/\s+/).includes('e2e/district-subpages-cls.smoke.ts')
    )

    it("pr-preview.yml runs the spec on the preview job's build (#2544)", () => {
      // Served inside the runner like the channel (firebase.json headers,
      // Hosting's brotli; prPreviewLocalBuild.test.ts). CDP network
      // emulation does throttle loopback: on 2026-11-08 a 200 KB fetch took
      // 5.0 s throttled on 127.0.0.1, localhost and a LAN address alike.
      expect(shards.length).toBeGreaterThan(0)
      expect(smokeJobEnv(wf)['BASE_URL']).toBe('http://127.0.0.1:4173')
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
