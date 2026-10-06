import { test, expect } from '@playwright/test'

/* CLS budget for the district overview `/district/:id`, measured live (#1647).
 *
 * ── The blind spot this closes ───────────────────────────────────────────
 * `lighthouserc.js` only loads `/`. The district overview carried CLS
 * 0.25–0.31 on desktop and 0.44–0.69 on mobile (Lighthouse, prod) with every
 * gate green. The shifts were all async inserts and skeleton→content height
 * mismatches inside the Overview stack: a 64px KPI skeleton swapping for a
 * 312px (desktop) / 750px (mobile) strip, an Overview panel that mounted only
 * once the date index landed, a header toolbar that gained the freshness pill
 * late, and trophy/growth skeletons shorter than their loaded panels.
 *
 * ── Method ───────────────────────────────────────────────────────────────
 * Same instrument as `landing-font-swap-cls.smoke.ts`: the deployed preview
 * channel (BASE_URL), a cold cache, and a `layout-shift` observer installed
 * before navigation via `addInitScript`. No network throttling: Lighthouse's
 * default (simulated) throttling loads the page at full speed, and that is
 * the load that reproduced #1647 — the CDN reads resolve in the same frames
 * the skeletons first paint, so every height mismatch becomes a shift.
 *
 * Both the current program year and a past one (`?py=2024`, no Club Growth
 * card, no CSP line) at a phone and a desktop width.
 *
 * Chromium-only: `layout-shift` is a Chromium API, so the webkit project
 * skips rather than silently passing.
 *
 * ── Reading a failure ────────────────────────────────────────────────────
 * The message prints every entry and its named sources. Read the sources,
 * not the total: a moved `.space-y-4` means something above it changed
 * height; the node whose own height changed is the slot to reserve.
 */

const CLS_BUDGET = 0.1

const VIEWPORTS = [
  { name: 'mobile', width: 412, height: 823 },
  { name: 'desktop', width: 1350, height: 940 },
] as const

const PATHS = ['/district/61', '/district/61?py=2024'] as const

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

test.describe('district overview CLS on a cold load (#1647)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift is Chromium-only'
  )

  for (const vp of VIEWPORTS) {
    for (const path of PATHS) {
      test(`${path} at ${vp.width}px stays inside the 0.1 CLS budget`, async ({
        page,
      }) => {
        test.setTimeout(120_000)
        await page.setViewportSize({ width: vp.width, height: vp.height })

        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Network.enable')
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

        await page.addInitScript(INSTALL_OBSERVER)
        await page.goto(path, { waitUntil: 'load', timeout: 60_000 })

        // Sanity gate before the number is read: an all-zeros CLS almost
        // always means the page never left its loading state. The loaded KPI
        // strip is the last above-the-fold block to resolve.
        await page
          .locator(
            'section.district-kpi-strip:not(.district-kpi-strip--loading)'
          )
          .waitFor({ state: 'visible', timeout: 60_000 })
        await page.evaluate(() => document.fonts.ready.then(() => undefined))
        // Let the separately-resolving queries (awards, checkpoints, clubs)
        // land before sampling.
        await page.waitForTimeout(4_000)

        const entries = await page.evaluate(() => window.__clsEntries ?? [])
        const total = Number(
          entries.reduce((a, e) => a + e.value, 0).toFixed(5)
        )
        const breakdown = entries
          .filter(e => e.value > 0.0005)
          .map(
            e =>
              `  t=${e.t}ms value=${e.value}\n    ${e.sources.join('\n    ')}`
          )
          .join('\n')

        expect(
          total,
          `${path} CLS at ${vp.width}px is ${total} (budget ${CLS_BUDGET}) on ${page.url()}\n` +
            `Largest contributors — read the sources, not the total:\n${breakdown}`
        ).toBeLessThan(CLS_BUDGET)
      })
    }
  }
})
