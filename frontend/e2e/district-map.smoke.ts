import { test, expect, type Page } from '@playwright/test'

/* District club map (#1784) on the deployed preview (BASE_URL), at 375 and
 * 1280, light and dark. Real data (D61) and the real basemap archive.
 *
 *  - the map region and its canvas render, inside the viewport, with no
 *    sideways page scroll;
 *  - pins drew: the pin layer reports rendered pins/clusters
 *    (`data-rendered-pins`, written on MapLibre's `idle`);
 *  - no CSP, worker or tile error on the deployed headers (Lesson 122: only
 *    the preview proves the CSP);
 *  - legend chips are ≥ 44 px tall with ≥ 14 px text, and toggle `?status=`;
 *  - tapping a pin opens the club summary — a sheet at 375, the side panel
 *    at 1280 — with a club-page link and no contact details;
 *  - "Not on the map" is listed.
 */

const MAP = '/district/61/map'

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
      await expect
        .poll(
          async () => Number(await region.getAttribute('data-rendered-pins')),
          { timeout: 30_000 }
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

      // Tap a single pin (the layer reports one clear of the edges).
      await expect
        .poll(() => region.getAttribute('data-pin-sample'), {
          timeout: 20_000,
        })
        .toMatch(/^\d+,\d+$/)
      const [x, y] = (await region.getAttribute('data-pin-sample'))!
        .split(',')
        .map(Number) as [number, number]
      await region.click({ position: { x, y } })
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
