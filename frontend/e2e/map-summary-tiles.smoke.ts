import { test, expect } from './fixtures/test'

/* Region and world club-map summary tiles on a narrow phone (#2318).
 *
 * The three tiles (Clubs · Members/Districts · Need intervention) share one
 * row at every width. At 320 each tile has ~59px for its label, and the
 * 14px semibold "intervention" (81px on macOS) and "Members" (63px) ran out
 * of their tiles. With Linux's wider fallback font the last tile's label
 * crossed the viewport and the page scrolled sideways by 1px (PR #2321's
 * preview smoke). Every label must stay inside its tile.
 *
 * Measured on the deployed build (BASE_URL).
 */

const PAGES = ['/region/05/map', '/regions/map']

for (const path of PAGES) {
  for (const width of [320, 375, 390]) {
    test(`summary labels stay inside their tiles on ${path} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
      await page
        .locator('[data-testid="region-map-summary"], .region-map__summary')
        .first()
        .waitFor({ timeout: 30_000 })
      await page.evaluate(() => document.fonts.ready)

      const tiles = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('.region-map__summary .rollup-kpi')
        ).map(tile => {
          const label = tile.querySelector('.rollup-kpi__label') as HTMLElement
          const t = tile.getBoundingClientRect()
          const l = label.getBoundingClientRect()
          return {
            text: label.textContent,
            // Content wider than its box: a word ran out of the tile.
            overflow: label.scrollWidth - label.clientWidth,
            labelRight: Math.round(l.right),
            tileRight: Math.round(t.right),
          }
        })
      )
      const ctx = JSON.stringify(tiles)
      expect(tiles.length, ctx).toBe(3)
      for (const t of tiles) {
        expect(t.overflow, ctx).toBeLessThanOrEqual(0)
        expect(t.labelRight, ctx).toBeLessThanOrEqual(t.tileRight)
      }
    })
  }
}
