import { test, expect, type Page } from '@playwright/test'

/* District club map (#1784) on the deployed preview (BASE_URL), at 375 and
 * 1280, light and dark. Real data (D61) and the real basemap archive.
 *
 *  - the map region and its canvas render, inside the viewport, with no
 *    sideways page scroll;
 *  - pins drew: a screenshot of the map holds single pins in the health
 *    fills (found in the page's own 2D canvas, so no test-only hooks in
 *    the app);
 *  - no CSP, worker or tile error on the deployed headers (Lesson 122: only
 *    the preview proves the CSP);
 *  - legend chips are ≥ 44 px tall with ≥ 14 px text, and toggle `?status=`;
 *  - tapping a pin opens the club summary — a sheet at 375, the side panel
 *    at 1280 — with a club-page link and no contact details;
 *  - "Not on the map" is listed.
 */

const MAP = '/district/61/map'

/* The health fills (spec §3.3) as drawn on the canvas. */
const HEALTH_FILLS = [
  [0x2a, 0x8f, 0x6e],
  [0xe0, 0xa0, 0x30],
  [0xc9, 0x3d, 0x3d],
]

/* Find single pins in a screenshot: horizontal runs of a health fill 5–14
 * px long (a pin is 14 px; clusters are 32 px and up) whose vertical run is
 * short too. Returns their centres in CSS px, clear of the bottom strip. */
async function findPins(
  page: Page,
  png: Buffer,
  skipBottom: number,
  cssWidth: number
): Promise<Array<{ x: number; y: number }>> {
  return page.evaluate(
    async ({ b64, fills, skipBottom, cssWidth }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
      // Screenshots are in device pixels (WebKit's profile is 2x).
      const k = width / cssWidth
      const hit = (x: number, y: number) => {
        const i = (y * width + x) * 4
        return fills.some(
          ([r, g, b]) =>
            Math.abs(data[i]! - r!) < 12 &&
            Math.abs(data[i + 1]! - g!) < 12 &&
            Math.abs(data[i + 2]! - b!) < 12
        )
      }
      const found: Array<{ x: number; y: number }> = []
      for (let y = 20 * k; y < height - skipBottom * k; y += 2) {
        let x = 20 * k
        while (x < width - 20 * k) {
          if (!hit(x, y)) {
            x++
            continue
          }
          let end = x
          while (end < width && hit(end, y)) end++
          const run = end - x
          const cx = Math.round((x + end) / 2)
          if (run >= 5 * k && run <= 14 * k) {
            let top = y
            let bottom = y
            while (top > 0 && hit(cx, top - 1)) top--
            while (bottom < height - 1 && hit(cx, bottom + 1)) bottom++
            if (bottom - top <= 14 * k)
              found.push({
                x: Math.round(cx / k),
                y: Math.round((top + bottom) / 2 / k),
              })
          }
          x = end
        }
      }
      return found
    },
    { b64: png.toString('base64'), fills: HEALTH_FILLS, skipBottom, cssWidth }
  )
}

async function open(
  page: Page,
  theme: 'light' | 'dark',
  width: number
): Promise<string[]> {
  const errors: string[] = []
  const ours = /pmtiles|maplibre|worker|Content Security Policy|basemap|WebGL/i
  page.on('console', msg => {
    if (msg.type() === 'error' && ours.test(msg.text())) errors.push(msg.text())
  })
  page.on('pageerror', err => {
    if (ours.test(`${err.message} ${err.stack ?? ''}`)) errors.push(err.message)
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
  return errors
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    test(`district map at ${width} (${theme}): pins, legend, tap`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      const errors = await open(page, theme, width)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      const region = page.getByRole('region', {
        name: 'Club map, coloured by club health',
      })
      await expect(region.locator('canvas.maplibregl-canvas')).toBeVisible({
        timeout: 30_000,
      })
      // Pins drew (tiles, pins and icons settle within a few seconds).
      const skipBottom = width < 768 ? 200 : 40
      let pins: Array<{ x: number; y: number }> = []
      await expect
        .poll(
          async () => {
            const box = (await region.boundingBox())!
            pins = await findPins(
              page,
              await region.screenshot(),
              skipBottom,
              box.width
            )
            return pins.length
          },
          { timeout: 30_000, intervals: [1_000, 2_000] }
        )
        .toBeGreaterThan(0)

      const m = await page.evaluate(() => {
        const chips = Array.from(
          document.querySelectorAll<HTMLElement>('.map-legend__chip')
        ).filter(el => el.getBoundingClientRect().width > 0)
        return {
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          chipCount: chips.length,
          minChipHeight: Math.min(
            ...chips.map(c => c.getBoundingClientRect().height)
          ),
          minChipFont: Math.min(
            ...chips.map(c => parseFloat(getComputedStyle(c).fontSize))
          ),
        }
      })
      expect(m.overflow).toBeLessThanOrEqual(0)
      expect(m.chipCount).toBeGreaterThan(0)
      expect(m.minChipHeight).toBeGreaterThanOrEqual(44)
      expect(m.minChipFont).toBeGreaterThanOrEqual(14)

      // ODbL credit visible in both themes.
      await expect(region.locator('.maplibregl-ctrl-attrib')).toBeVisible()

      // Tap a single pin found in the screenshot.
      await region.click({ position: pins[0]! })
      const summary =
        width < 768
          ? page.getByRole('dialog', { name: /Club details|Clubs here/ })
          : page.getByRole('complementary', { name: 'Map legend and lists' })
      const link = summary.getByRole('link', { name: /Open club page/ }).first()
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', /\/district\/61\/club\/\w+/)
      const text = (await summary.textContent()) ?? ''
      expect(text).not.toMatch(/@|passcode|zoom\.us/i)
      if (width < 768) await page.keyboard.press('Escape')

      // A legend chip filters through ?status= (one URL write).
      const chip = page
        .locator('.map-legend__chip[aria-pressed]')
        .filter({ hasText: 'Intervention required' })
        .first()
      await chip.click()
      await expect(page).toHaveURL(/status=intervention/)
      await expect(chip).toHaveAttribute('aria-pressed', 'true')

      if (width >= 768) {
        await expect(
          page.getByRole('region', { name: /Not on the map \(\d+\)/ })
        ).toBeVisible()
      }
      expect(errors).toEqual([])
    })
  }
}
