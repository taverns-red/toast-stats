import { test, expect, type Page } from './fixtures/test'

/* The lazy-route fallback must reserve the page, so the footer does not jump
 * (#2633).
 *
 * While a route chunk loads, `<main>` holds only `PageLoadingFallback`. If that
 * fallback is short, the shell footer paints inside the viewport and is pushed
 * off-screen when the page mounts: 0.11-0.20 CLS at 768px and up on
 * /methodology, /history, /awards, /mcp, /videos and the region routes, from
 * the footer alone. Phones have no footer, so they are unaffected.
 *
 * Method: the route's page chunk (`assets/<Name>Page-<hash>.js`) is held for
 * CHUNK_DELAY_MS, so the fallback is on screen for a known, generous time on
 * any machine (a delay beats throttling here: it is the same on a fast laptop
 * and a slow CI runner). A `layout-shift` observer is installed before
 * navigation. Chromium-only: `layout-shift` is a Chromium API.
 *
 * Reading a failure: the message prints every shift with its named sources.
 * A `FOOTER.app-shell-footer` source means the fallback is shorter than the
 * viewport.
 */

const CLS_BUDGET = 0.1
const CHUNK_DELAY_MS = 2_500

const CASES = [
  { path: '/methodology', width: 768, height: 1024 },
  { path: '/history', width: 768, height: 1024 },
  { path: '/methodology', width: 1280, height: 900 },
  { path: '/regions/health', width: 1280, height: 900 },
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

async function measure(
  page: Page,
  path: string,
  vp: { width: number; height: number }
): Promise<{ total: number; footerShifts: number; breakdown: string }> {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await page.addInitScript(INSTALL_OBSERVER)
  // Hold the lazy page chunk so the Suspense fallback is what paints.
  await page.route(/\/assets\/[^/]*Page-[^/]*\.js(\?.*)?$/, async route => {
    await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS))
    // fallback, not continue: the request still meets the CDN fixture route.
    await route.fallback()
  })
  await page.goto(path, { waitUntil: 'load', timeout: 60_000 })
  // The page mounted: the fallback is gone and the route's own h1 is there.
  await page.locator('main h1').first().waitFor({ timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.waitForTimeout(1_500)

  const entries = await page.evaluate(() => window.__clsEntries ?? [])
  const total = Number(entries.reduce((a, e) => a + e.value, 0).toFixed(5))
  const footerShifts = entries.filter(e =>
    e.sources.some(s => s.includes('app-shell-footer'))
  ).length
  const breakdown = entries
    .filter(e => e.value > 0.0005)
    .map(e => `  t=${e.t}ms value=${e.value}\n    ${e.sources.join('\n    ')}`)
    .join('\n')
  return { total, footerShifts, breakdown }
}

test.describe('lazy-route fallback reserves the page (#2633)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift is Chromium-only'
  )

  for (const c of CASES) {
    test(`${c.path} at ${c.width}px: footer does not shift, CLS under budget`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const { total, footerShifts, breakdown } = await measure(page, c.path, c)
      const detail = `${c.path} at ${c.width}px: CLS ${total} (budget ${CLS_BUDGET}), ${footerShifts} footer shift(s)\n${breakdown}`
      expect(footerShifts, detail).toBe(0)
      expect(total, detail).toBeLessThan(CLS_BUDGET)
    })
  }
})
