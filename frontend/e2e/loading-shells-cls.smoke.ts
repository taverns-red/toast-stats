import { test, expect, type Page } from './fixtures/test'

/* Loading shells must be the loaded box (#2634).
 *
 * Several pages rendered a loading state much shorter than, or shaped
 * differently from, the loaded page, so the content (and the footer) jumped
 * when the data landed: region rankings 0.33, countries 0.74, club history
 * 0.14, the district map 0.19, training 0.09, the 404 with suggestions 0.17
 * and /history 0.09 on a cold load.
 *
 * Method: every CDN data read is held for DATA_DELAY_MS, so the loading shell
 * is on screen for a known, generous time on any machine (the same on a fast
 * laptop and a slow CI runner). A `layout-shift` observer is installed before
 * navigation; the number is read after the network is idle and the shell has
 * resolved. Each case must stay under CLS_BUDGET. Chromium-only:
 * `layout-shift` is a Chromium API.
 *
 * Reading a failure: the message prints every shift with its named sources
 * (class of the moved node, previous and current rect). The node whose own
 * height changed is the slot to reserve.
 */

const CLS_BUDGET = 0.1
const DATA_DELAY_MS = 2_500

const CASES = [
  { path: '/region/04', width: 768, height: 1024 },
  { path: '/region/04', width: 375, height: 812 },
  { path: '/region/04', width: 1280, height: 900 },
  { path: '/regions', width: 375, height: 812 },
  { path: '/history/countries', width: 768, height: 1024 },
  { path: '/history/countries', width: 1280, height: 900 },
  { path: '/district/61/club/9127/history', width: 768, height: 1024 },
  { path: '/district/61/club/9127/history', width: 1280, height: 900 },
  { path: '/district/U/map', width: 1280, height: 900 },
  { path: '/district/61/training', width: 375, height: 812 },
  // An unknown subpage of a real district: the 404 offers that district's
  // pages as suggestions once the district list lands.
  { path: '/district/61/no-such-page', width: 375, height: 812 },
  { path: '/history', width: 768, height: 1024 },
  { path: '/history', width: 375, height: 812 },
] as const

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
          return `<${tag}.${cls}> ${rect(s.previousRect)} -> ${rect(s.currentRect)}`
        }),
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
}

/* Every loading placeholder the pages render; the number is read only after
 * none is left. */
const PENDING_SELECTOR =
  '[aria-label^="Loading"], .chart-skeleton, .animate-pulse, [data-testid="wm-skeleton"]'

async function measure(
  page: Page,
  path: string,
  vp: { width: number; height: number }
): Promise<{ total: number; breakdown: string }> {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  // Lighthouse's mobile profile (150ms RTT, 1.6 Mbps, 4x CPU) on a cold
  // cache, as the other CLS smokes: the route chunk and the data arrive
  // apart, as they do for a visitor.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.addInitScript(INSTALL_OBSERVER)
  // Hold every CDN data read. `fallback`, not `continue`, so the request still
  // meets the CDN fixture route on the PR preview shards.
  // A local build is not on the CDN's CORS allow-list, so there the read is
  // relayed through Playwright with a permissive header (as
  // priority-columns.smoke.ts does); a deployed preview is on the list.
  const local = /localhost|127\.0\.0\.1/.test(process.env['BASE_URL'] ?? '')
  await page.route(/\/\/cdn(-staging)?\.taverns\.red\//, async route => {
    await new Promise(resolve => setTimeout(resolve, DATA_DELAY_MS))
    if (!local) {
      await route.fallback()
      return
    }
    const res = await route.fetch()
    await route.fulfill({
      response: res,
      headers: { ...res.headers(), 'access-control-allow-origin': '*' },
    })
  })
  await page.goto(path, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForFunction(
    sel => document.querySelector(sel) === null,
    PENDING_SELECTOR,
    { timeout: 60_000 }
  )
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.waitForTimeout(2_000)

  const entries = await page.evaluate(() => window.__clsEntries ?? [])
  const total = Number(entries.reduce((a, e) => a + e.value, 0).toFixed(5))
  const breakdown = entries
    .filter(e => e.value > 0.0005)
    .map(e => `  t=${e.t}ms value=${e.value}\n    ${e.sources.join('\n    ')}`)
    .join('\n')
  return { total, breakdown }
}

test.describe('loading shells match the loaded layout (#2634)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift is Chromium-only'
  )

  for (const c of CASES) {
    test(`${c.path} at ${c.width}px stays inside the 0.1 CLS budget with data delayed`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      const { total, breakdown } = await measure(page, c.path, c)
      expect(
        total,
        `${c.path} at ${c.width}px: CLS ${total} (budget ${CLS_BUDGET})\n${breakdown}`
      ).toBeLessThan(CLS_BUDGET)
    })
  }
})
