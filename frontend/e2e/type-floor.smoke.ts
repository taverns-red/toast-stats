import { test, expect } from './fixtures/test'
import { measureText } from './helpers/mobile-measure'

/* Phone type floor at 375 (#1840, epic #1827).
 *
 * The 2026-10-11 mobile review found 40–90% of visible characters under 14px
 * on 15 of 25 routes: the 16px ≤640 body rule is undercut by `text-xs`,
 * `text-[11px]`, ~80 component rules at 10–13px and 10px chart ticks. The
 * target (review §7) is ≤15% of visible characters under 14px on every route,
 * with 12px reserved for uppercase eyebrows/labels — so nothing visible may
 * render under 12px at all.
 *
 * Method mirrors the review's `summarize.mjs text`: every non-empty text node
 * whose parent is rendered, counted by character at the parent's computed
 * font-size. Visually hidden text (sr-only: a ≤1px box) is not "visible
 * characters" and is skipped. Font size does not depend on theme, so one
 * theme; both engines (the `smoke`/`webkit` projects).
 */

const VIEWPORT = { width: 375, height: 812 }
const MAX_SHARE_UNDER_14 = 0.15
const HARD_FLOOR_PX = 12

// Every route the review and the 2.48.0 prod sweep measured.
const ROUTES = [
  '/',
  '/district/61',
  '/district/61/clubs',
  '/district/61/divisions',
  '/district/61/rankings',
  '/district/61/trends',
  '/district/61/changes',
  '/district/61/grid',
  '/district/61/action-list',
  '/district/61/division/A',
  '/district/61/division/A/area/01',
  '/district/61/club/1009147',
  '/district/61/club/7238597/history',
  '/district/80',
  '/regions',
  '/region/05',
  '/history',
  '/history/countries',
  '/methodology',
  '/awards',
  '/clubs',
  '/clubs/race/distinguished',
  '/mcp',
  '/videos', // #2310
]

for (const path of ROUTES) {
  test(`≤15% of text under 14px, none under 12px, at 375 — ${path}`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(VIEWPORT)
    await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.evaluate(() => document.fonts.ready)
    // Content-ready + non-vacuity: chrome alone is ~100 characters, so wait
    // for the route's data to render before measuring.
    await expect
      .poll(async () => (await measureText(page, HARD_FLOOR_PX)).total, {
        timeout: 30_000,
      })
      .toBeGreaterThan(300)
    await page.waitForTimeout(500)

    const s = await measureText(page, HARD_FLOOR_PX)
    const share = s.under14 / s.total
    expect(
      s.belowFloor,
      `${path}: text under ${HARD_FLOOR_PX}px: ${s.belowFloor.join('; ')}`
    ).toEqual([])
    expect(
      share,
      `${path}: ${(share * 100).toFixed(1)}% of ${s.total} visible characters ` +
        `are under 14px (max ${MAX_SHARE_UNDER_14 * 100}%). Largest: ` +
        s.offenders.join('; ')
    ).toBeLessThanOrEqual(MAX_SHARE_UNDER_14)
  })
}
