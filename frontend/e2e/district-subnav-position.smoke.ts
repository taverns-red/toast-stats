import { test, expect } from './fixtures/test'

/* The district section bar holds one position across tabs (#2646, HUB-07).
 *
 * On the deployed site at 1280 the `.district-subnav` top sat at six heights
 * (188 to 269px), so the bar jumped up to 81px under the pointer between
 * tabs. Causes: a 48px "District 61" breadcrumb under an h1 that already
 * says it, a one- or two-line lede, and Changes and Council carrying a
 * header of their own.
 *
 * Real geometry (L108): jsdom has no layout, so only `getBoundingClientRect`
 * proves the bar does not move. Measured at scroll 0, once the web fonts have
 * settled (a font swap re-wraps the lede, which is the thing under test).
 */

const TABS = [
  '/district/61',
  '/district/61/clubs',
  '/district/61/divisions',
  '/district/61/changes',
  '/district/61/map',
  '/district/61/council',
] as const

const TOLERANCE_PX = 1

test.describe('district section bar position (#2646)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('the bar top is identical across hub, clubs, divisions, changes, map and council', async ({
    page,
  }) => {
    const tops: Record<string, number> = {}
    for (const path of TABS) {
      await page.goto(path)
      const bar = page.locator('.district-subnav')
      await expect(bar).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(() => window.scrollTo(0, 0))
      // The header settles as its data lands: read the top until it has held
      // still for five reads (150ms apart), then record it.
      const readTop = () =>
        bar.evaluate(el => el.getBoundingClientRect().top + window.scrollY)
      let last = await readTop()
      let still = 0
      for (let i = 0; i < 40 && still < 5; i++) {
        await page.waitForTimeout(150)
        const now = await readTop()
        still = now === last ? still + 1 : 0
        last = now
      }
      tops[path] = last
    }
    const values = Object.values(tops)
    const spread = Math.max(...values) - Math.min(...values)
    expect(
      spread,
      `section bar top per tab: ${JSON.stringify(tops)}`
    ).toBeLessThanOrEqual(TOLERANCE_PX)
  })

  test('no tab carries a breadcrumb above the bar', async ({ page }) => {
    for (const path of TABS.slice(1)) {
      await page.goto(path)
      await expect(page.locator('.district-subnav')).toBeVisible()
      await expect(page.getByTestId('subpage-breadcrumb')).toHaveCount(0)
    }
  })
})
