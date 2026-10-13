import { test, expect } from './fixtures/test'

/* District map static preview (#1943) on the deployed preview (BASE_URL),
 * at 375 and 1280, light and dark, both engines. Real D61 data.
 *
 * The `maplibre` chunk is held back, as on a slow phone, to prove:
 *  - the map box shows the clubs as dots with no MapLibre and no tile
 *    (no `.pmtiles` request has been made);
 *  - the preview fills the reserved box, so nothing shifts when the live
 *    map arrives (the box is the same size before and after);
 *  - once released, the live map paints and the preview fades out.
 */

const MAP = '/district/61/map'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    test(`district map preview at ${width} (${theme})`, async ({ page }) => {
      test.setTimeout(90_000)
      let release!: () => void
      const held = new Promise<void>(r => (release = r))
      await page.route(/\/maplibre-[\w-]+\.js$/, async route => {
        await held
        await route.continue()
      })
      const tiles: string[] = []
      page.on('request', r => {
        if (/\.pmtiles/.test(r.url())) tiles.push(r.url())
      })
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript(t => {
        try {
          window.localStorage.setItem('theme', t)
        } catch {
          // storage blocked: the page falls back to the system theme
        }
      }, theme)
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 })
      await page.goto(MAP, { waitUntil: 'domcontentloaded', timeout: 60_000 })

      const canvas = page.locator('.district-map__canvas')
      const preview = canvas.locator('[data-testid="map-preview"]')
      await expect(preview).toBeVisible({ timeout: 30_000 })
      await expect(preview).toHaveAttribute('data-state', 'loading')
      expect(await preview.locator('circle').count()).toBeGreaterThan(10)
      await expect(canvas.locator('canvas.maplibregl-canvas')).toHaveCount(0)
      expect(tiles).toEqual([])

      const before = (await canvas.boundingBox())!
      const fill = (await preview.boundingBox())!
      expect(Math.abs(fill.width - before.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(fill.height - before.height)).toBeLessThanOrEqual(2)

      release()
      await expect(canvas.locator('canvas.maplibregl-canvas')).toBeVisible({
        timeout: 30_000,
      })
      await expect(preview).toHaveAttribute('data-state', 'painted', {
        timeout: 30_000,
      })
      await expect(preview).toBeHidden()
      expect(tiles.length).toBeGreaterThan(0)
      const after = (await canvas.boundingBox())!
      expect(after).toEqual(before)
    })
  }
}
