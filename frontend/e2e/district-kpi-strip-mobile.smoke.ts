import { test, expect, type Page } from './fixtures/test'

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

/* index.css sets `html { scroll-behavior: smooth }`, so a plain
 * `scrollTo(0, y)` animates, and on a loaded WebKit runner it had not moved
 * 400 ms later: the probe then read the unscrolled page (stripTop 108) on
 * #2672 and #2684 (#2685). Jump instantly, then wait on the position itself,
 * never on a timer. */
async function scrollInstantly(page: Page, y: number): Promise<void> {
  await page.evaluate(
    top => window.scrollTo({ top, left: 0, behavior: 'instant' }),
    y
  )
  await page.waitForFunction(top => Math.abs(window.scrollY - top) < 1, y)
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

    await scrollInstantly(page, SCROLL_Y)

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
    await scrollInstantly(page, SCROLL_Y)

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
  await scrollInstantly(page, SCROLL_Y)

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

/* #2708 (D4): once the KPI block has scrolled away, one opaque line of at most
 * 64px pins under the top bar, at every width. The full strip itself is never
 * sticky (it was 312px tall and translucent at 1280). */
const STUCK_LINE = '[data-testid="district-kpi-stuck-line"]'

for (const [width, height] of [
  [375, 812],
  [768, 1024],
  [1280, 900],
] as const) {
  test(`stuck KPI line is one opaque line of at most ${MAX_STICKY_HEIGHT}px at ${width}px (#2708)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await loadOverview(page, '/district/61')
    await scrollInstantly(page, SCROLL_Y)
    await page
      .locator('[data-testid="district-kpi-stuck"][data-stuck="true"]')
      .waitFor({ state: 'attached' })

    const m = await page.evaluate(sel => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return null
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const kids = Array.from(el.children).map(c => c.getBoundingClientRect())
      const probe = document.elementFromPoint(r.left + 8, r.top + r.height / 2)
      const smallest = Array.from(el.querySelectorAll('*')).reduce(
        (min, n) => Math.min(min, parseFloat(getComputedStyle(n).fontSize)),
        99
      )
      return {
        height: Math.round(r.height),
        visibility: cs.visibility,
        background: cs.backgroundColor,
        backdrop: cs.backdropFilter,
        rowTops: Array.from(new Set(kids.map(k => Math.round(k.top)))).length,
        hit: !!probe && el.contains(probe),
        smallestFont: smallest,
        top: Math.round(r.top),
      }
    }, STUCK_LINE)

    const msg = JSON.stringify(m)
    expect(m, msg).not.toBeNull()
    expect(m?.visibility, msg).toBe('visible')
    expect(m?.height, msg).toBeLessThanOrEqual(MAX_STICKY_HEIGHT)
    expect(m?.rowTops, msg).toBe(1)
    // Opaque: an rgb() colour, or rgba() with alpha 1; and no blur.
    expect(m?.background, msg).not.toMatch(/rgba\(.*,\s*0?\.\d+\)$/)
    expect(m?.background, msg).not.toBe('rgba(0, 0, 0, 0)')
    expect(m?.backdrop, msg).toBe('none')
    expect(m?.hit, msg).toBe(true)
    expect(m?.smallestFont, msg).toBeGreaterThanOrEqual(12)
  })
}

test('stuck KPI line is hidden while the KPI block is on screen (#2708)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadOverview(page, '/district/61')
  await scrollInstantly(page, 0)
  const visibility = await page.evaluate(
    sel => getComputedStyle(document.querySelector(sel) as Element).visibility,
    STUCK_LINE
  )
  expect(visibility).toBe('hidden')
})

test('the full KPI strip is in flow at 1280px, not pinned (#2708)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await loadOverview(page, '/district/61')
  const position = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('.district-kpi-strip') as Element)
        .position
  )
  expect(position).toBe('relative')
})
