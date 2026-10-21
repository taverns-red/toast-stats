import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * Contract test for the Lighthouse MOBILE gate (#1830, epic #1827).
 *
 * `lighthouserc.js` is the desktop gate (preset desktop, `/` only, localhost
 * fixtures). The mobile review found that gate blind to phones: club LCP was
 * 10.5 s and every route paid ~1.1 MB of fixed cost. `lighthouserc.mobile.js`
 * runs the mobile profile on five routes against the deployed preview.
 * Lesson 082: a gate that is never invoked protects nothing, so this asserts
 * the wiring as well as the config.
 */

const ROOT = join(__dirname, '..', '..', '..')
const require = createRequire(import.meta.url)
const MOBILE_RC = join(ROOT, 'lighthouserc.mobile.js')
const PR_PREVIEW = '.github/workflows/pr-preview.yml'

// lighthouserc files are CommonJS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (path: string): any => require(path)

const ROUTES_1830 = [
  '/',
  '/district/61',
  '/district/61/clubs',
  '/district/61/club/7238597',
  '/regions',
]

describe('lighthouserc.mobile.js (#1830)', () => {
  it('exists', () => {
    expect(existsSync(MOBILE_RC)).toBe(true)
  })

  const rc = existsSync(MOBILE_RC) ? load(MOBILE_RC) : { ci: {} }
  const settings = rc.ci?.collect?.settings ?? {}

  it('runs the mobile profile, never the desktop preset', () => {
    expect(settings.preset).toBeUndefined()
    expect(settings.formFactor).toBe('mobile')
    expect(settings.screenEmulation?.mobile).toBe(true)
  })

  it('throttles at the review profile: 150 ms RTT, 1.6 Mbps, 4x CPU (simulated)', () => {
    expect(settings.throttlingMethod).toBe('simulate')
    expect(settings.throttling?.rttMs).toBe(150)
    expect(settings.throttling?.throughputKbps).toBeCloseTo(1638.4)
    expect(settings.throttling?.cpuSlowdownMultiplier).toBe(4)
  })

  it('collects the five routes the issue names', () => {
    const paths = (rc.ci?.collect?.url ?? []).map(
      (u: string) => new URL(u).pathname
    )
    expect(paths).toEqual(ROUTES_1830)
  })

  it('takes several runs per route (variance, not one sample)', () => {
    expect(rc.ci?.collect?.numberOfRuns).toBeGreaterThanOrEqual(3)
  })

  describe('assertions', () => {
    const matrix: Array<{
      matchingUrlPattern: string
      assertions: Record<string, [string, { maxNumericValue: number }]>
    }> = rc.ci?.assert?.assertMatrix ?? []

    it('has one entry per route, and each pattern matches only its own route', () => {
      expect(matrix).toHaveLength(ROUTES_1830.length)
      const base = 'https://example.web.app'
      for (const [i, route] of ROUTES_1830.entries()) {
        // The patterns are built from LHCI_BASE_URL at load time; re-check
        // them structurally against the loaded base.
        const re = new RegExp(matrix[i]!.matchingUrlPattern)
        const loadedBase = new URL(rc.ci.collect.url[i]).origin
        expect(re.test(loadedBase + route)).toBe(true)
        for (const other of ROUTES_1830.filter(r => r !== route)) {
          expect(re.test(loadedBase + other)).toBe(false)
        }
        expect(re.test(base + route)).toBe(false)
      }
    })

    it('asserts LCP, CLS, script and total transfer on every route', () => {
      for (const entry of matrix) {
        for (const audit of [
          'largest-contentful-paint',
          'cumulative-layout-shift',
          'resource-summary:script:size',
          'resource-summary:total:size',
        ]) {
          expect(entry.assertions[audit], audit).toBeDefined()
        }
      }
    })

    // Promoted after the green week (#1830): 23 preview runs on 2026-10-19
    // passed every budget, best-of-3, with the least headroom on club LCP
    // (worst 3480 ms vs 3800 ms).
    it('is error-level after the green-week promotion recorded on #1830', () => {
      for (const entry of matrix) {
        for (const [level] of Object.values(entry.assertions)) {
          expect(level).toBe('error')
        }
      }
    })

    it('asserts exactly the declared per-route budgets', () => {
      const keys = Object.keys(rc.ROUTES)
      for (const [i, entry] of matrix.entries()) {
        const b = rc.BUDGETS[keys[i]!]
        const max = (audit: string) =>
          entry.assertions[audit]![1].maxNumericValue
        expect(max('largest-contentful-paint')).toBe(b.lcpMs)
        expect(max('cumulative-layout-shift')).toBe(b.cls)
        expect(max('resource-summary:script:size')).toBe(b.scriptBytes)
        expect(max('resource-summary:total:size')).toBe(b.totalBytes)
      }
    })

    it('every budget still gates something: below the pre-#1830 baseline', () => {
      // Prod before #1830 (Lighthouse mobile): club 15.1 s / 2.36 MB. A budget
      // at or above the old numbers would gate nothing.
      for (const b of Object.values(
        rc.BUDGETS as Record<string, Record<string, number>>
      )) {
        expect(b.lcpMs).toBeLessThan(15000)
        expect(b.totalBytes).toBeLessThan(2.36 * 1024 * 1024)
        expect(b.cls).toBeLessThanOrEqual(0.2)
      }
    })

    it('holds the final budgets re-baselined on 2026-10-21 (#1856)', () => {
      // Ron, 2026-10-21: "Re-baseline and close." 13 PR-preview runs x 3
      // samples (2026-10-20/21). LHCI asserts the best of 3 (`optimistic`),
      // so each LCP and total-bytes budget is the worst per-run best + ~10%,
      // or the #1830 target where that already passes. These are the final
      // budgets: no ratchet issue tracks them further. A budget may only go
      // DOWN from here; never raise one to make a run pass.
      const KB = 1024
      const FINAL: Record<string, Record<string, number>> = {
        // LCP worst-best 3273 ms; total 327 KB
        landing: {
          lcpMs: 3600,
          cls: 0.1,
          scriptBytes: 300 * KB,
          totalBytes: 500 * KB,
        },
        // LCP worst-best 4021 ms (no longer bimodal, #1995); total 481 KB
        district: {
          lcpMs: 4450,
          cls: 0.1,
          scriptBytes: 300 * KB,
          totalBytes: 530 * KB,
        },
        // LCP worst-best 4310 ms; total 560 KB
        clubs: {
          lcpMs: 4750,
          cls: 0.1,
          scriptBytes: 300 * KB,
          totalBytes: 620 * KB,
        },
        // LCP worst-best 3501 ms: 3800 stays (never raised); total 584 KB
        club: {
          lcpMs: 3800,
          cls: 0.1,
          scriptBytes: 300 * KB,
          totalBytes: 640 * KB,
        },
        // LCP worst-best 3193 ms; total 317 KB
        regions: {
          lcpMs: 3500,
          cls: 0.1,
          scriptBytes: 300 * KB,
          totalBytes: 500 * KB,
        },
      }
      expect(rc.BUDGETS).toEqual(FINAL)
    })

    it('has no open ratchet: the budgets are final, not tracked by an issue (#1856)', () => {
      expect(rc).not.toHaveProperty('RATCHET_ISSUE')
    })
  })
})

describe('pr-preview.yml runs the mobile gate against the preview (#1830)', () => {
  const wf = readFileSync(join(ROOT, PR_PREVIEW), 'utf8')

  it('invokes Lighthouse CI with lighthouserc.mobile.js', () => {
    expect(wf).toMatch(/configPath:\s*['"]?\.\/lighthouserc\.mobile\.js/)
  })

  it('points it at the deployed preview URL', () => {
    expect(wf).toMatch(
      /LHCI_BASE_URL:\s*\$\{\{\s*steps\.deploy\.outputs\.url\s*\}\}/
    )
  })
})

describe('the desktop gate is not weakened (#1830)', () => {
  const desktop = load(join(ROOT, 'lighthouserc.js'))

  it('still runs the desktop preset and errors on LCP > 2.5 s and CLS > 0.1', () => {
    expect(desktop.ci.collect.settings.preset).toBe('desktop')
    expect(desktop.ci.assert.assertions['largest-contentful-paint']).toEqual([
      'error',
      { maxNumericValue: 2500 },
    ])
    expect(desktop.ci.assert.assertions['cumulative-layout-shift']).toEqual([
      'error',
      { maxNumericValue: 0.1 },
    ])
  })
})
