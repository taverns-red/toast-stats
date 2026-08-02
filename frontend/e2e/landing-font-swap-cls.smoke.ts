import { test, expect } from '@playwright/test'

/* Mobile CLS budget for the landing page, measured live (#1373).
 *
 * ── The blind spot this closes ───────────────────────────────────────────
 * `lighthouserc.js` asserts `cumulative-layout-shift <= 0.1` and passes, but
 * it is blind to this failure in two independent ways:
 *
 *   1. `preset: 'desktop'` — mobile is never sampled. The worst case is at
 *      375px; at 1350px the real number genuinely is under budget.
 *   2. Its fixtures are served from `localhost:4173`, and Chromium does not
 *      throttle loopback. A naive local run reads ~0.00 at every width
 *      *including on known-bad builds*, so a clean local table proves
 *      nothing.
 *
 * Consequence: `main` carried CLS 0.151 at 375px — 95% of it the
 * Google-Fonts `display=swap` reflow — with every gate green. This test is
 * the missing half of the fix: without it, tokens/font-fallbacks.css can be
 * deleted, or a stack reordered so system-ui wins, and nothing goes red.
 *
 * ── Method ───────────────────────────────────────────────────────────────
 * The three things that make the number real, all of which the Lighthouse
 * gate lacks: a **deployed** origin (BASE_URL, the PR preview channel), a
 * **cold cache with Fast-3G throttling** applied via CDP (so fonts.gstatic
 * lands after first paint, the way it does for a real phone), and the
 * `layout-shift` observer installed **before navigation** via
 * `addInitScript` — an observer attached after load misses the entries that
 * matter, even with `buffered: true` when the page has already settled.
 *
 * Chromium-only: `layout-shift` and CDP network emulation are both
 * Chromium-only, so the webkit project skips rather than silently passing.
 *
 * ── Reading a failure ────────────────────────────────────────────────────
 * The assertion message prints every entry's value and named sources. Read
 * those, never the total: the aggregate cannot tell you whether it is one
 * regression or the sum of two unrelated ones (Lesson: "bisecting a gate
 * with no headroom finds variance, not a regression").
 *
 * A result of exactly 0 with the table missing is a broken run, not a pass —
 * hence the explicit content assertion before the number is read.
 */

const VIEWPORT = { width: 375, height: 900 }

// The same budget lighthouserc.js enforces on desktop. Measured on the
// preview channel after #1373 the landing page sits an order of magnitude
// below it, so this is a real regression detector and not a coin flip.
const CLS_BUDGET = 0.1

// DevTools "Fast 3G".
const FAST_3G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 562.5,
}

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
        r ? `${Math.round(r.y)}x${Math.round(r.height)}` : '-'
      window.__clsEntries?.push({
        t: Math.round(e.startTime),
        value: Number(e.value.toFixed(5)),
        sources: (e.sources ?? []).map(s => {
          const tag = s.node?.tagName ?? 'DETACHED'
          const cls = (s.node?.className ?? '').toString().split(' ')[0]
          return `<${tag}.${cls}> ${rect(s.previousRect)} -> ${rect(s.currentRect)}`
        }),
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
}

test.describe('landing CLS at 375px on a cold Fast-3G load (#1373)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'layout-shift + CDP network emulation are Chromium-only'
  )

  test('stays inside the 0.1 CLS budget with fonts loading normally', async ({
    page,
  }) => {
    // A full cold Fast-3G load of the landing page plus a settle window.
    test.setTimeout(240_000)
    await page.setViewportSize(VIEWPORT)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', FAST_3G)

    await page.addInitScript(INSTALL_OBSERVER)
    await page.goto('/', { waitUntil: 'load', timeout: 180_000 })

    // Sanity gate before the number is read: an all-zeros CLS almost always
    // means the page never got past its loading state (or the channel 404'd),
    // not that the page is perfect.
    await page
      .locator('table[aria-label="District rankings"]')
      .waitFor({ state: 'visible', timeout: 120_000 })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    // Let any post-swap reflow land before sampling.
    await page.waitForTimeout(3_000)

    const entries = await page.evaluate(() => window.__clsEntries ?? [])
    const total = Number(entries.reduce((a, e) => a + e.value, 0).toFixed(5))

    const breakdown = entries
      .filter(e => e.value > 0.0005)
      .map(
        e => `  t=${e.t}ms value=${e.value}\n    ${e.sources.join('\n    ')}`
      )
      .join('\n')

    expect(
      total,
      `landing CLS at 375px is ${total} (budget ${CLS_BUDGET}) on ${page.url()}\n` +
        `Largest contributors — read the sources, not the total:\n${breakdown}\n` +
        `If the sources name text elements that move without changing height, ` +
        `the metric-matched fallbacks in tokens/font-fallbacks.css have drifted ` +
        `or been dropped from a font stack (#1373).`
    ).toBeLessThan(CLS_BUDGET)
  })
})
