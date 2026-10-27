import { test, expect } from './fixtures/test'

/* Next-deadline strip (#2298) on a 390px phone.
 *
 * The strip names the next Toastmasters dates of the page's program year
 * (from the one cited table in programYearDeadlines.ts). It sits on the
 * district Overview, a division page and an area page. This guards that it
 * renders there with its data, stays inside the viewport, and adds no
 * horizontal page scroll at phone width — in light and dark.
 *
 * On the phone Overview the hub (tiles + Needs attention) owns the first
 * screen (district-overview-hub-mobile.smoke.ts), so the strip sits right
 * after the hub there, never above it.
 */

const PHONE = { width: 390, height: 844 }
const PAGES = [
  '/district/61',
  '/district/61/division/A',
  '/district/61/division/A/area/01',
] as const

for (const scheme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`deadline strip at 390 on ${path} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize(PHONE)
      await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
      const strip = page.locator(
        '[data-testid="next-deadline-strip"]:not([aria-busy="true"])'
      )
      await strip.waitFor({ state: 'visible', timeout: 30_000 })
      await page.evaluate(() => document.fonts.ready.then(() => undefined))

      // Either upcoming deadlines or the "all passed" line — never empty.
      await expect(
        strip.locator('.deadline-strip__item, .deadline-strip__done').first()
      ).toBeVisible()

      const m = await strip.evaluate(el => {
        const r = el.getBoundingClientRect()
        return {
          left: r.left,
          right: r.right,
          docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        }
      })
      expect(m.left).toBeGreaterThanOrEqual(0)
      expect(m.right).toBeLessThanOrEqual(PHONE.width)
      expect(m.docOverflow).toBeLessThanOrEqual(0)
    })
  }
}

test('phone Overview: the strip follows the hub, not above it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/district/61', { waitUntil: 'networkidle', timeout: 60_000 })
  const strip = page.locator(
    '[data-testid="next-deadline-strip"]:not([aria-busy="true"])'
  )
  await strip.waitFor({ state: 'visible', timeout: 30_000 })
  const hub = page.locator(
    '[data-testid="district-hub-mobile"]:not(.district-hub--loading)'
  )
  await hub.waitFor({ state: 'visible', timeout: 30_000 })
  const [hubBox, stripBox] = await Promise.all([
    hub.boundingBox(),
    strip.boundingBox(),
  ])
  expect(stripBox!.y).toBeGreaterThanOrEqual(hubBox!.y + hubBox!.height)
})
