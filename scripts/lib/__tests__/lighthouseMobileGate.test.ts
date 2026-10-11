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

    it('is warn-level until the green-week promotion recorded on #1830', () => {
      for (const entry of matrix) {
        for (const [level] of Object.values(entry.assertions)) {
          expect(level).toBe('warn')
        }
      }
    })

    it('CLS budget is the 0.1 target on every route', () => {
      for (const entry of matrix) {
        expect(
          entry.assertions['cumulative-layout-shift']![1].maxNumericValue
        ).toBeLessThanOrEqual(0.1)
      }
    })

    it('any budget looser than its target names a ratchet issue', () => {
      const { TARGET, BUDGETS, RATCHET_ISSUE } = rc
      const loose = Object.entries(
        BUDGETS as Record<string, Record<string, number>>
      ).filter(([route, b]) => {
        const lcpTarget = route === 'club' ? TARGET.clubLcpMs : TARGET.hubLcpMs
        return (
          b.lcpMs! > lcpTarget ||
          b.cls! > TARGET.cls ||
          b.scriptBytes! > TARGET.scriptBytes ||
          b.totalBytes! > TARGET.totalBytes
        )
      })
      if (loose.length > 0) {
        expect(RATCHET_ISSUE).toMatch(/^#\d+$/)
      }
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
