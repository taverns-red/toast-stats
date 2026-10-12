import { test, expect, type Page } from '@playwright/test'

/* District KPI strip must not pin over the Overview on a phone (#1828, epic
 * #1827, mobile review S2).
 *
 * ── The bug this guards ──────────────────────────────────────────────────
 * `.district-kpi-strip` was `position: sticky` at every width (#572). At 375
 * the expanded strip is ~860px tall, so once the reader scrolled ~400px it
 * pinned under the top bar and the narrative, divisions and milestones all
 * scrolled underneath it. The review's scroll probe found the strip under
 * the viewport centre at scroll 600/1200/2000/3000 every time.
 *
 * ── Method ───────────────────────────────────────────────────────────────
 * Deployed preview channel (BASE_URL), real data. Measure by hit-testing and
 * bounding box (Lesson 134), not toBeVisible: scroll to 1200 and ask
 * `elementFromPoint` what is at the viewport centre — it must not be inside
 * the strip. Then sweep every element below 768 for a sticky/fixed box taller
 * than 64px (review §7 "Overview readable while scrolling"); the same sweep
 * runs at 768 (vertical stickiness only). At 1280 the strip must still be
 * sticky — #572's desktop intent is unchanged.
 */

const PATHS = ['/district/61', '/district/80'] as const
const MAX_STICKY_HEIGHT = 64
const SCROLL_Y = 1200
/* #1842: below 768 the Overview's KPI block is the phone hub
 * (`district-hub-mobile`), not the strip. The guard is the same for both:
 * the block is in flow and never under the viewport centre once scrolled. */
const KPI_BLOCK = '.district-kpi-strip, [data-testid="district-hub-mobile"]'
const KPI_BLOCK_LOADED =
  '.district-kpi-strip:not(.district-kpi-strip--loading), ' +
  '[data-testid="district-hub-mobile"]:not(.district-hub--loading)'

async function loadOverview(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  // Wait for the loaded strip (not its skeleton) so we test the real height.
  await page
    .locator(KPI_BLOCK_LOADED)
    .waitFor({ state: 'attached', timeout: 30_000 })
  await page.waitForTimeout(500)
}

for (const path of PATHS) {
  test(`KPI strip is not under the viewport centre at scroll ${SCROLL_Y} on ${path} at 375px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loadOverview(page, path)

    // The page must be long enough to scroll past the strip, or the probe
    // would pass vacuously.
    const scrollHeight = await page.evaluate(
      () => document.documentElement.scrollHeight
    )
    expect(scrollHeight).toBeGreaterThan(SCROLL_Y + 812)

    await page.evaluate(y => window.scrollTo(0, y), SCROLL_Y)
    await page.waitForTimeout(400)

    const probe = await page.evaluate(sel => {
      const strip = document.querySelector(sel)
      const centre = document.elementFromPoint(
        window.innerWidth / 2,
        window.innerHeight / 2
      )
      const r = strip?.getBoundingClientRect()
      return {
        position: strip ? getComputedStyle(strip).position : null,
        stripTop: r ? Math.round(r.top) : null,
        stripBottom: r ? Math.round(r.bottom) : null,
        centreInStrip: !!(strip && centre && strip.contains(centre)),
      }
    }, KPI_BLOCK)

    // In flow: `relative` (no offsets) is the base rule — it keeps the strip
    // the loading shimmer's containing block — never sticky/fixed.
    expect(['static', 'relative'], JSON.stringify(probe)).toContain(
      probe.position
    )
    expect(probe.centreInStrip, JSON.stringify(probe)).toBe(false)
  })

  test(`no sticky or fixed element taller than ${MAX_STICKY_HEIGHT}px on ${path} at 375px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loadOverview(page, path)
    await page.evaluate(y => window.scrollTo(0, y), SCROLL_Y)
    await page.waitForTimeout(400)

    const tall = await page.evaluate(max => {
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const pos = getComputedStyle(el).position
        if (pos !== 'sticky' && pos !== 'fixed') continue
        const r = el.getBoundingClientRect()
        // Hidden/closed overlays (0×0 or off-screen) don't cover content.
        if (r.width === 0 || r.height === 0) continue
        if (r.bottom <= 0 || r.top >= window.innerHeight) continue
        if (r.height > max) {
          const cls =
            typeof el.className === 'string'
              ? el.className.split(' ').slice(0, 3).join('.')
              : ''
          out.push(
            `${el.tagName.toLowerCase()}.${cls} ${Math.round(r.height)}px`
          )
        }
      }
      return out
    }, MAX_STICKY_HEIGHT)

    expect(tall, tall.join('\n')).toEqual([])
  })
}

/* #1828 follow-up: at 768–979 the strip is one card per row and 576px tall,
 * so pinned at 768 it still covered the tablet Overview. The pin now starts
 * at 1024. Only vertical stickiness is swept (a table's sticky first column
 * has top:auto and pins sideways, not over the content below). */
test('no vertically sticky element taller than 64px on /district/61 at 768px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await loadOverview(page, '/district/61')
  await page.evaluate(y => window.scrollTo(0, y), SCROLL_Y)
  await page.waitForTimeout(400)

  const tall = await page.evaluate(max => {
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el)
      if (cs.position !== 'sticky' && cs.position !== 'fixed') continue
      if (cs.position === 'sticky' && cs.top === 'auto' && cs.bottom === 'auto')
        continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue
      if (r.height > max) {
        const cls =
          typeof el.className === 'string'
            ? el.className.split(' ').slice(0, 3).join('.')
            : ''
        out.push(`${el.tagName.toLowerCase()}.${cls} ${Math.round(r.height)}px`)
      }
    }
    return out
  }, MAX_STICKY_HEIGHT)

  expect(tall, tall.join('\n')).toEqual([])
})

test('KPI strip stays sticky under the top bar at 1280px (#572 desktop intent)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadOverview(page, '/district/61')
  const style = await page.evaluate(() => {
    const strip = document.querySelector('.district-kpi-strip')
    if (!strip) return null
    const cs = getComputedStyle(strip)
    return { position: cs.position, top: cs.top }
  })
  expect(style).toEqual({ position: 'sticky', top: '56px' })
})
