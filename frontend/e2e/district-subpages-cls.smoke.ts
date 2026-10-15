import { test, expect, type Page } from './fixtures/test'

/* CLS budget for the routed district subpages `/district/:id/*` (#1837).
 *
 * ── The blind spot this closes ───────────────────────────────────────────
 * `lighthouserc.js` loads only `/`, and `district-overview-cls.smoke.ts` only
 * the Overview hub. The eight subpages had no CLS gate at all, and on prod
 * 2.48.0 three of them shifted well past budget on a throttled cold load:
 * divisions 0.20, analytics 0.24, action-list 0.23 at 375px, analytics 0.30
 * at 1280px. Every source was a slot that rendered nothing (or an
 * empty-data state) while the per-district date index was still in flight —
 * the page's queries are disabled until the dates resolve, so `isLoading` is
 * false and the `isLoading && <Skeleton/>` arm never painted — followed by
 * the loaded content landing above content that was already on screen, and
 * at 1280px the shell footer being pushed off the short loading page.
 *
 * ── Method ───────────────────────────────────────────────────────────────
 * The Lighthouse mobile profile (150ms RTT, 1.6 Mbps, 4x CPU) on a cold
 * cache, a `layout-shift` observer installed before navigation via
 * `addInitScript`, against the deployed preview channel (BASE_URL). The
 * throttling is load-bearing: unthrottled, the dates and the data land in the
 * first frames and every 375px shift above read 0 on prod.
 *
 * Chromium-only: `layout-shift` and CDP throttling are Chromium APIs, so the
 * webkit project skips rather than silently passing.
 *
 * ── Reading a failure ────────────────────────────────────────────────────
 * The message prints every entry and its named sources. Read the sources,
 * not the total: a moved node means something above it changed height; the
 * node whose own height changed is the slot to reserve.
 */

const CLS_BUDGET = 0.1

/* The division and area entity pages (#1896) are held to 0.05, the issue's
 * acceptance bar: they are short pages, so a loading state that drops the page
 * chrome lets the shell footer show and then pushes it off (0.059 at 1280). */
const ENTITY_CLS_BUDGET = 0.05

const ENTITY_PAGES = [
  '/district/61/division/A',
  '/district/61/division/A/area/01',
] as const

const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

const SUBPAGES = [
  'changes',
  'clubs',
  'divisions',
  'grid',
  // The club map (#1784): the map box is reserved before MapLibre arrives.
  'map',
  // The Club Growth funnel (#1794).
  'growth',
  // Education awards PYTD (#1793).
  'education',
  'trends',
  'analytics',
  'rankings',
  'action-list',
  // The phone clubs list has two shapes (#1833): grouped by division in the
  // default view, one flat list once the user re-sorts or filters. The bare
  // `clubs` entry above is the grouped view; this is the flat one.
  'clubs?sort=name&dir=desc',
] as const

/* Lighthouse's mobile profile, applied through CDP. */
const LIGHTHOUSE_MOBILE_NETWORK = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
}
const LIGHTHOUSE_MOBILE_CPU_SLOWDOWN = 4

/* Every loading placeholder the subpages render. The number is read only
 * after none is left, so an all-zeros CLS cannot come from a page that never
 * left its loading state. */
const PENDING_SELECTOR =
  '[aria-label^="Loading"], .chart-skeleton, .animate-pulse'

interface ShiftEntry {
  t: number
  value: number
  sources: string[]
}

declare global {
  interface Window {
    __clsEntries?: ShiftEntry[]
  }
}

const INSTALL_OBSERVER = () => {
  window.__clsEntries = []
  new PerformanceObserver(list => {
    for (const raw of list.getEntries()) {
      const e = raw as PerformanceEntry & {
        hadRecentInput: boolean
        value: number
        sources?: {
          node?: Element
          previousRect?: DOMRect
          currentRect?: DOMRect
        }[]
      }
      if (e.hadRecentInput) continue
      const rect = (r?: DOMRect) =>
        r ? `y${Math.round(r.y)} h${Math.round(r.height)}` : '-'
      window.__clsEntries?.push({
        t: Math.round(e.startTime),
        value: Number(e.value.toFixed(5)),
        sources: (e.sources ?? []).map(s => {
          const el = s.node as HTMLElement | undefined
          const tag = el?.tagName ?? 'DETACHED'
          const cls = (el?.className ?? '').toString().split(' ')[0]
          const testId = el?.dataset?.['testid']
          return `<${tag}.${cls}${testId ? `[${testId}]` : ''}> ${rect(s.previousRect)} -> ${rect(s.currentRect)}`
        }),
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
}

/* Cold, throttled load of `path`; returns the summed CLS and a readable
 * per-entry breakdown. `ready` proves the page left its loading state. */
async function measureCls(
  page: Page,
  path: string,
  vp: (typeof VIEWPORTS)[number],
  ready: string
): Promise<{ total: number; breakdown: string }> {
  await page.setViewportSize({ width: vp.width, height: vp.height })

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', LIGHTHOUSE_MOBILE_NETWORK)
  await cdp.send('Emulation.setCPUThrottlingRate', {
    rate: LIGHTHOUSE_MOBILE_CPU_SLOWDOWN,
  })

  await page.addInitScript(INSTALL_OBSERVER)
  // `networkidle`, not `load`: the data reads chain off the date index
  // after `load`, and a page still waiting on them renders no
  // placeholder at all on prod — the very bug — so the pending-selector
  // wait below would pass on a page that never loaded.
  await page.goto(path, { waitUntil: 'networkidle', timeout: 120_000 })

  // Sanity gate: the page rendered and every placeholder resolved.
  await page.locator(ready).first().waitFor({
    state: 'attached',
    timeout: 60_000,
  })
  await page.waitForFunction(
    sel => document.querySelector(sel) === null,
    PENDING_SELECTOR,
    { timeout: 120_000 }
  )
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  // Let late independent queries land before sampling.
  await page.waitForTimeout(3_000)

  const entries = await page.evaluate(() => window.__clsEntries ?? [])
  const total = Number(entries.reduce((a, e) => a + e.value, 0).toFixed(5))
  const breakdown = entries
    .filter(e => e.value > 0.0005)
    .map(e => `  t=${e.t}ms value=${e.value}\n    ${e.sources.join('\n    ')}`)
    .join('\n')
  return { total, breakdown }
}

test.describe('district subpages CLS on a throttled cold load (#1837)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift + CDP throttling are Chromium-only'
  )

  for (const vp of VIEWPORTS) {
    for (const sub of SUBPAGES) {
      const path = `/district/61/${sub}`
      test(`${path} at ${vp.width}px stays inside the 0.1 CLS budget`, async ({
        page,
      }) => {
        test.setTimeout(180_000)
        const { total, breakdown } = await measureCls(
          page,
          path,
          vp,
          '.district-detail-page'
        )
        expect(
          total,
          `${path} CLS at ${vp.width}px is ${total} (budget ${CLS_BUDGET}) on ${page.url()}\n` +
            `Largest contributors — read the sources, not the total:\n${breakdown}`
        ).toBeLessThan(CLS_BUDGET)
      })
    }
  }
})

test.describe('division and area entity pages CLS (#1896)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift + CDP throttling are Chromium-only'
  )

  for (const vp of VIEWPORTS) {
    for (const path of ENTITY_PAGES) {
      test(`${path} at ${vp.width}px stays inside the 0.05 CLS budget`, async ({
        page,
      }) => {
        test.setTimeout(180_000)
        // The loaded page's own heading; the loading state has no h1.
        const { total, breakdown } = await measureCls(
          page,
          path,
          vp,
          'h1.districts-page-header__title'
        )
        expect(
          total,
          `${path} CLS at ${vp.width}px is ${total} (budget ${ENTITY_CLS_BUDGET}) on ${page.url()}\n` +
            `Largest contributors — read the sources, not the total:\n${breakdown}`
        ).toBeLessThan(ENTITY_CLS_BUDGET)
      })
    }
  }
})
